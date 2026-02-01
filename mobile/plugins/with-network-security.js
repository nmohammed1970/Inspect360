const { 
  withAndroidManifest, 
  withDangerousMod,
  withInfoPlist,
  withXcodeProject 
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo config plugin to configure Android and iOS network security
 * This bundles the intermediate CA certificate in the app so it works on all devices
 */
const withNetworkSecurity = (config) => {
  // ========== ANDROID CONFIGURATION ==========
  
  // Add network security config XML
  config = withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults;
    
    // Find or create the application tag
    let application = androidManifest.manifest.application?.[0];
    if (!application) {
      application = {};
      androidManifest.manifest.application = [application];
    }
    
    // Add network security config attribute
    application.$ = {
      ...application.$,
      'android:networkSecurityConfig': '@xml/network_security_config',
    };
    
    return config;
  });

  // Create network security config file and bundle certificate
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      
      // Paths for Android resources
      const androidResPath = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'res',
        'xml'
      );
      
      const androidRawPath = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'res',
        'raw'
      );
      
      // Certificate source path
      const certSourcePath = path.join(
        projectRoot,
        'assets',
        'certs',
        'intermediate-ca-bundle.pem'
      );
      
      // Create directories if they don't exist
      if (!fs.existsSync(androidResPath)) {
        fs.mkdirSync(androidResPath, { recursive: true });
      }
      
      if (!fs.existsSync(androidRawPath)) {
        fs.mkdirSync(androidRawPath, { recursive: true });
      }
      
      // Copy certificate to raw resources (bundle it in APK)
      if (fs.existsSync(certSourcePath)) {
        const certDestPath = path.join(androidRawPath, 'intermediate_ca_bundle.pem');
        fs.copyFileSync(certSourcePath, certDestPath);
        console.log('✓ Bundled intermediate CA certificate for Android');
      } else {
        console.warn('⚠ Certificate file not found at:', certSourcePath);
        console.warn('⚠ Run: node scripts/extract-certificates.js');
      }
      
      // Create network security config that references the bundled certificate
      const networkSecurityConfig = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- Trust system certificates by default -->
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>

    <!-- Trust custom certificates for inspect360.ai domain -->
    <domain-config cleartextTrafficPermitted="false">
        <domain includeSubdomains="true">inspect360.ai</domain>
        <domain includeSubdomains="true">portal.inspect360.ai</domain>
        <domain includeSubdomains="true">*.inspect360.ai</domain>
        <trust-anchors>
            <!-- Trust system certificates -->
            <certificates src="system" />
            <!-- Trust bundled intermediate CA certificate -->
            <certificates src="@raw/intermediate_ca_bundle" />
            <!-- Trust user-installed certificates (fallback) -->
            <certificates src="user" />
        </trust-anchors>
    </domain-config>

    <!-- For local development -->
    <domain-config cleartextTrafficPermitted="false">
        <domain includeSubdomains="false">localhost</domain>
        <domain includeSubdomains="false">127.0.0.1</domain>
        <domain includeSubdomains="false">10.0.2.2</domain>
        <trust-anchors>
            <certificates src="system" />
            <certificates src="user" />
        </trust-anchors>
    </domain-config>
</network-security-config>`;
      
      fs.writeFileSync(
        path.join(androidResPath, 'network_security_config.xml'),
        networkSecurityConfig
      );
      
      return config;
    },
  ]);

  // ========== iOS CONFIGURATION ==========
  
  // Add certificate to iOS bundle and configure App Transport Security
  config = withInfoPlist(config, (config) => {
    // Configure App Transport Security to allow custom certificates
    config.modResults.NSAppTransportSecurity = {
      ...config.modResults.NSAppTransportSecurity,
      NSExceptionDomains: {
        ...config.modResults.NSAppTransportSecurity?.NSExceptionDomains,
        'inspect360.ai': {
          NSIncludesSubdomains: true,
          NSExceptionAllowsInsecureHTTPLoads: false,
          NSExceptionRequiresForwardSecrecy: true,
          NSExceptionMinimumTLSVersion: 'TLSv1.2',
          // Trust user-installed certificates
          NSExceptionAllowsInsecureLocalhost: false,
        },
        'portal.inspect360.ai': {
          NSIncludesSubdomains: true,
          NSExceptionAllowsInsecureHTTPLoads: false,
          NSExceptionRequiresForwardSecrecy: true,
          NSExceptionMinimumTLSVersion: 'TLSv1.2',
        },
      },
    };
    
    return config;
  });

  // Bundle certificate for iOS
  config = withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      
      // Certificate source path
      const certSourcePath = path.join(
        projectRoot,
        'assets',
        'certs',
        'intermediate-ca-bundle.pem'
      );
      
      // iOS bundle path (certificates go in the app bundle)
      const iosBundlePath = path.join(
        projectRoot,
        'ios',
        'Inspect360',
        'intermediate-ca-bundle.pem'
      );
      
      // Create ios directory if it doesn't exist (for prebuild)
      const iosDir = path.dirname(iosBundlePath);
      if (!fs.existsSync(iosDir)) {
        fs.mkdirSync(iosDir, { recursive: true });
      }
      
      // Copy certificate to iOS bundle
      if (fs.existsSync(certSourcePath)) {
        fs.copyFileSync(certSourcePath, iosBundlePath);
        console.log('✓ Bundled intermediate CA certificate for iOS');
      } else {
        console.warn('⚠ Certificate file not found at:', certSourcePath);
        console.warn('⚠ Run: node scripts/extract-certificates.js');
      }
      
      return config;
    },
  ]);

  return config;
};

module.exports = withNetworkSecurity;

