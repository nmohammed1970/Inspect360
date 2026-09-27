import type { NavigationProp } from '@react-navigation/native';
import type { TenantTabParamList } from './types';

/** Set from TenantTabs screenListeners so overlay hosts can deep-link. */
export const tenantTabNavigationRef: {
  current: NavigationProp<TenantTabParamList> | null;
} = {
  current: null,
};
