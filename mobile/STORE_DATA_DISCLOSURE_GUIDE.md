# Store Data Disclosure Guide

This guide helps you accurately fill out the data collection and privacy forms required by App Store Connect and Google Play Console.

---

## 📱 App Store Connect - App Privacy Details

### Data Types Collected

#### 1. **Contact Information**
- **Type**: Email Address, Name, Phone Number
- **Purpose**: App Functionality, Account Management
- **Linked to User**: ✅ Yes
- **Used for Tracking**: ❌ No
- **Collection**: ✅ Collected

#### 2. **User Content**
- **Type**: Photos, Notes, Inspection Reports, Maintenance Requests
- **Purpose**: App Functionality, Core Features
- **Linked to User**: ✅ Yes
- **Used for Tracking**: ❌ No
- **Collection**: ✅ Collected

#### 3. **Location Data**
- **Type**: Property Addresses (when provided by user)
- **Purpose**: App Functionality
- **Linked to User**: ✅ Yes
- **Used for Tracking**: ❌ No
- **Collection**: ✅ Collected (User-provided)

#### 4. **Identifiers**
- **Type**: User ID, Device ID
- **Purpose**: App Functionality, Account Management
- **Linked to User**: ✅ Yes
- **Used for Tracking**: ❌ No
- **Collection**: ✅ Collected

#### 5. **Diagnostics**
- **Type**: Crash Logs, Performance Data (if collected)
- **Purpose**: App Functionality, Analytics
- **Linked to User**: ❌ No (if anonymized)
- **Used for Tracking**: ❌ No
- **Collection**: ✅ Collected (if applicable)

### Data Not Collected
- ❌ Health & Fitness Data
- ❌ Financial Information
- ❌ Sensitive Information (beyond what's listed)
- ❌ Biometric Data
- ❌ Purchases
- ❌ Search History
- ❌ Browsing History

### Data Linked to User
**Answer**: ✅ **Yes** - All data is linked to user accounts for app functionality.

### Data Used for Tracking
**Answer**: ❌ **No** - We do not use data for tracking purposes.

### Data Sharing
**Answer**: ❌ **No** - We do not sell or share user data with third parties for advertising or tracking purposes.

**Exception**: We may share data with service providers (hosting, analytics) who are bound by confidentiality agreements and only process data to provide services.

---

## 🤖 Google Play Console - Data Safety Section

### Data Collection

#### **Personal Information**
1. **Email Address**
   - Purpose: Account management, authentication
   - Required: ✅ Yes
   - Optional: ❌ No

2. **Name**
   - Purpose: User identification, profile
   - Required: ✅ Yes
   - Optional: ❌ No

3. **Phone Number**
   - Purpose: Contact, account recovery
   - Required: ❌ No
   - Optional: ✅ Yes

#### **Photos and Videos**
- **Type**: Inspection photos, maintenance photos
- **Purpose**: Core app functionality
- **Required**: ✅ Yes (for inspections)
- **Optional**: ❌ No (for core features)

#### **Location Data**
- **Type**: Property addresses (user-provided)
- **Purpose**: Property identification
- **Required**: ✅ Yes (for inspections)
- **Optional**: ❌ No

#### **Files and Documents**
- **Type**: Inspection reports, documents
- **Purpose**: Core app functionality
- **Required**: ✅ Yes
- **Optional**: ❌ No

### Data Sharing

**Do you share user data with third parties?**
- **Answer**: ❌ **No** (for advertising/tracking)
- **Exception**: ✅ **Yes** - With service providers (hosting, analytics) under strict confidentiality agreements

**Do you sell user data?**
- **Answer**: ❌ **No**

**Do you allow users to request data deletion?**
- **Answer**: ✅ **Yes** - Users can request account deletion

### Security Practices

**Data Encryption**
- ✅ Data encrypted in transit (HTTPS/TLS)
- ✅ Data encrypted at rest (server-side)
- ✅ Local data encrypted (iOS Keychain/Android Keystore)

**Data Deletion**
- ✅ Users can delete account and data
- ✅ Local data deleted on logout/uninstall
- ✅ Server data deleted per user request

---

## 📋 Step-by-Step Instructions

### App Store Connect

1. **Go to**: App Store Connect → Your App → App Privacy
2. **Click**: "Get Started" or "Edit"
3. **For each data type**:
   - Select the data type
   - Select purposes (App Functionality, Account Management)
   - Mark as "Linked to User": ✅ Yes
   - Mark as "Used for Tracking": ❌ No
4. **Data Collection**: Mark all applicable data types as "Collected"
5. **Data Sharing**: Select "No" for sharing with third parties
6. **Privacy Policy URL**: Enter your privacy policy URL
7. **Save** and submit

### Google Play Console

1. **Go to**: Play Console → Your App → Policy → App content → Data safety
2. **Click**: "Start" or "Edit"
3. **Data Collection**:
   - Add each data type you collect
   - Select purpose for each
   - Mark as Required or Optional
4. **Data Sharing**:
   - Answer "No" to selling data
   - Answer "No" to sharing for advertising
   - Answer "Yes" to service providers (with explanation)
5. **Security Practices**:
   - Select encryption methods
   - Select data deletion options
6. **Privacy Policy URL**: Enter your privacy policy URL
7. **Save** and submit

---

## ✅ Verification Checklist

Before submitting, verify:

- [ ] All data types accurately listed
- [ ] Purposes correctly identified
- [ ] "Linked to User" correctly marked
- [ ] "Used for Tracking" marked as No
- [ ] Privacy Policy URL is accessible
- [ ] Data sharing accurately disclosed
- [ ] Security practices accurately described
- [ ] All information matches your Privacy Policy

---

## 🚨 Common Mistakes to Avoid

1. **❌ Don't mark data as "Used for Tracking"** if you're not tracking users
2. **❌ Don't forget to list all data types** you collect
3. **❌ Don't mark optional data as required** (or vice versa)
4. **❌ Don't forget to update** if you add new data collection later
5. **❌ Don't use placeholder URLs** - use your actual privacy policy URL

---

## 📞 Need Help?

If you're unsure about any data type or purpose:
- Review your Privacy Policy
- Check what data your app actually collects
- When in doubt, be more specific rather than less
- Contact app store support if needed

---

## 🔄 Updates

Remember to update these disclosures if you:
- Add new data collection
- Change data purposes
- Start sharing data with new third parties
- Change your privacy practices

---

**Last Updated**: [DATE]

