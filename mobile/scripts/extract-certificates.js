/**
 * Script to extract SSL certificates from PKCS7 format
 * and prepare them for use in the mobile app
 * 
 * Run with: node scripts/extract-certificates.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const certDir = path.join(__dirname, '..', 'STAR.inspect360.ai_cert');
const outputDir = path.join(__dirname, '..', 'assets', 'certs');

// Create output directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log('Extracting certificates...');

try {
  // The CA bundle already contains the intermediate certificates in PEM format
  // Copy it to assets
  const caBundlePath = path.join(certDir, 'STAR.inspect360.ai.ca-bundle');
  const outputCaBundle = path.join(outputDir, 'intermediate-ca-bundle.pem');
  
  if (fs.existsSync(caBundlePath)) {
    fs.copyFileSync(caBundlePath, outputCaBundle);
    console.log('✓ Copied CA bundle to assets/certs/intermediate-ca-bundle.pem');
  } else {
    console.error('✗ CA bundle not found:', caBundlePath);
  }

  // Extract certificates from PKCS7 format (requires OpenSSL)
  const p7bPath = path.join(certDir, 'STAR.inspect360.ai.p7b');
  
  if (fs.existsSync(p7bPath)) {
    try {
      // Try to extract certificates using OpenSSL
      const certChain = execSync(
        `openssl pkcs7 -inform PEM -in "${p7bPath}" -print_certs -outform PEM`,
        { encoding: 'utf-8' }
      );
      
      // Save the full chain
      const chainPath = path.join(outputDir, 'cert-chain.pem');
      fs.writeFileSync(chainPath, certChain);
      console.log('✓ Extracted certificate chain to assets/certs/cert-chain.pem');
      
      // Split into individual certificates
      const certs = certChain.split('-----BEGIN CERTIFICATE-----').filter(c => c.trim());
      certs.forEach((cert, index) => {
        if (cert.trim()) {
          const certContent = '-----BEGIN CERTIFICATE-----' + cert.trim();
          const certPath = path.join(outputDir, `cert-${index + 1}.pem`);
          fs.writeFileSync(certPath, certContent);
          console.log(`✓ Extracted certificate ${index + 1} to assets/certs/cert-${index + 1}.pem`);
        }
      });
    } catch (error) {
      console.warn('⚠ Could not extract from PKCS7 (OpenSSL may not be installed):', error.message);
      console.log('ℹ Using CA bundle only. This should be sufficient for intermediate certificates.');
    }
  } else {
    console.warn('⚠ PKCS7 file not found:', p7bPath);
  }

  console.log('\n✓ Certificate extraction complete!');
  console.log('Certificates are now in: mobile/assets/certs/');
  
} catch (error) {
  console.error('✗ Error extracting certificates:', error);
  process.exit(1);
}

