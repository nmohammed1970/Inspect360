import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { profileService } from '../../services/profile';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Button from '../../components/ui/Button';

export default function ProfileScreen() {
  const { user, logout } = useAuth();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['/api/auth/profile'],
    queryFn: () => profileService.updateProfile({}), // This will fetch profile
    enabled: false, // We'll use user from auth context
  });

  const handleLogout = async () => {
    await logout();
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  const displayUser = profile || user;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Card>
        <View style={styles.profileHeader}>
          {displayUser?.profileImageUrl ? (
            <View style={styles.avatarContainer}>
              <Text style={styles.avatarText}>
                {displayUser.firstName?.[0] || 'U'}
              </Text>
            </View>
          ) : (
            <View style={styles.avatarContainer}>
              <Text style={styles.avatarText}>
                {displayUser?.firstName?.[0] || 'U'}
              </Text>
            </View>
          )}
          <View style={styles.profileInfo}>
            <Text style={styles.name}>
              {displayUser?.firstName} {displayUser?.lastName}
            </Text>
            <Text style={styles.email}>{displayUser?.email}</Text>
            <Text style={styles.role}>Role: {displayUser?.role}</Text>
          </View>
        </View>
      </Card>

      {displayUser?.phone && (
        <Card>
          <Text style={styles.label}>Phone</Text>
          <Text style={styles.value}>{displayUser.phone}</Text>
        </Card>
      )}

      {displayUser?.skills && displayUser.skills.length > 0 && (
        <Card>
          <Text style={styles.label}>Skills</Text>
          <View style={styles.tagsContainer}>
            {displayUser.skills.map((skill, index) => (
              <View key={index} style={styles.tag}>
                <Text style={styles.tagText}>{skill}</Text>
              </View>
            ))}
          </View>
        </Card>
      )}

      {displayUser?.qualifications && displayUser.qualifications.length > 0 && (
        <Card>
          <Text style={styles.label}>Qualifications</Text>
          <View style={styles.tagsContainer}>
            {displayUser.qualifications.map((qual, index) => (
              <View key={index} style={styles.tag}>
                <Text style={styles.tagText}>{qual}</Text>
              </View>
            ))}
          </View>
        </Card>
      )}

      <Button
        title="Sign Out"
        onPress={handleLogout}
        variant="danger"
        style={styles.logoutButton}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 16,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  profileInfo: {
    flex: 1,
  },
  name: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  role: {
    fontSize: 14,
    color: '#666',
    textTransform: 'capitalize',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  value: {
    fontSize: 16,
    color: '#000',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    backgroundColor: '#e0e0e0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  tagText: {
    fontSize: 14,
    color: '#333',
  },
  logoutButton: {
    marginTop: 24,
  },
});

