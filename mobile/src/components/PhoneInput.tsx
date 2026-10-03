import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Select from './ui/Select';
import Input from './ui/Input';
import {
  combinePhoneNumber,
  getPhoneCodeForCountry,
  getPhoneCodeOptions,
  normalizePhoneForStorage,
  parsePhoneNumber,
} from '../../../shared/phoneCountryCodes';
import { useTheme } from '../contexts/ThemeContext';
import { colors, spacing } from '../theme';

type Props = {
  value?: string | null;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  defaultCountryIso?: string;
};

function emitValue(countryCode: string, number: string): string {
  const combined = combinePhoneNumber(countryCode, number);
  if (!combined) return '';
  return normalizePhoneForStorage(combined) || combined;
}

export default function PhoneInput({
  value,
  onChange,
  label = 'Phone Number',
  placeholder = '7123456789',
  error,
  disabled,
  defaultCountryIso = 'GB',
}: Props) {
  const theme = useTheme();
  const themeColors = theme?.colors ?? colors;
  const defaultCode = getPhoneCodeForCountry(defaultCountryIso);
  const options = useMemo(() => {
    const list = getPhoneCodeOptions().map((o) => ({
      value: o.code,
      label: `${o.code} ${o.label}`,
    }));
    return list;
  }, []);

  const parsed = parsePhoneNumber(value || '');
  const [countryCode, setCountryCode] = useState(
    value && parsed.countryCode ? parsed.countryCode : defaultCode,
  );
  const [number, setNumber] = useState(parsed.number || '');

  useEffect(() => {
    const next = parsePhoneNumber(value || '');
    if (value && next.countryCode) setCountryCode(next.countryCode);
    else if (!value) setCountryCode(defaultCode);
    setNumber(next.number || '');
  }, [value, defaultCode]);

  const selectOptions =
    countryCode && !options.some((o) => o.value === countryCode)
      ? [{ value: countryCode, label: countryCode }, ...options]
      : options;

  return (
    <View style={styles.wrap}>
      {label ? (
        <Text style={[styles.label, { color: themeColors.text.primary }]}>{label}</Text>
      ) : null}
      <View style={styles.row}>
        <View style={styles.code}>
          <Select
            value={countryCode}
            options={selectOptions}
            onValueChange={(code) => {
              setCountryCode(code);
              onChange(emitValue(code, number));
            }}
            disabled={disabled}
            placeholder="Code"
          />
        </View>
        <View style={styles.number}>
          <Input
            value={number}
            onChangeText={(text) => {
              setNumber(text);
              onChange(emitValue(countryCode, text));
            }}
            placeholder={placeholder}
            keyboardType="phone-pad"
            editable={!disabled}
            error={error}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { fontSize: 14, fontWeight: '500', marginBottom: 4 },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  code: { width: 128 },
  number: { flex: 1 },
});
