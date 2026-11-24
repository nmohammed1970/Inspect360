import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Plus, Trash2, Search } from 'lucide-react-native';
import { v4 as uuidv4 } from 'uuid';
import {
  quotesService,
  type PriceBookItem,
  type QuoteLineWrite,
} from '../../services/quotes';
import {
  isQuoteEditable,
  MAINTENANCE_QUOTE_STATUS_LABELS,
} from '../../../../shared/maintenanceQuoteConstants';
import {
  MAINTENANCE_PRICE_BOOK_CATEGORIES,
  MAINTENANCE_PRICE_BOOK_CATEGORY_LABELS,
  MAINTENANCE_PRICE_BOOK_UNITS,
  MAINTENANCE_PRICE_BOOK_UNIT_LABELS,
  MAINTENANCE_PRICE_BOOK_VAT_RATES,
  MAINTENANCE_PRICE_BOOK_VAT_LABELS,
  type MaintenancePriceBookCategory,
  type MaintenancePriceBookUnit,
  type MaintenancePriceBookVatRate,
} from '../../../../shared/maintenancePriceBookConstants';
import {
  computeQuoteLine,
  computeQuoteTotals,
} from '../../../../shared/maintenanceFinanceMath';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import { colors, spacing, borderRadius, shadows } from '../../theme';
import { getFontSize } from '../../utils/responsive';
import type { WorkOrdersStackParamList } from '../../navigation/types';

type EditableLine = {
  localId: string;
  name: string;
  description: string;
  sku: string;
  category: MaintenancePriceBookCategory;
  unit: MaintenancePriceBookUnit;
  quantity: string;
  unitPriceMajor: string;
  vatRate: MaintenancePriceBookVatRate;
  priceBookItemId: string | null;
  linkedCatalogName: string | null;
};

function formatMoneyMinor(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

function majorInputToMinor(raw: string): number {
  const n = Number(String(raw).replace(/,/g, '').trim());
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function minorToMajorInput(minor: number): string {
  if (!Number.isFinite(minor)) return '0';
  return (minor / 100).toFixed(2);
}

function blankLine(): EditableLine {
  return {
    localId: uuidv4(),
    name: '',
    description: '',
    sku: '',
    category: 'labour',
    unit: 'hour',
    quantity: '1',
    unitPriceMajor: '0.00',
    vatRate: 'standard_20',
    priceBookItemId: null,
    linkedCatalogName: null,
  };
}

function ensureMinLine(lines: EditableLine[]): EditableLine[] {
  return lines.length === 0 ? [blankLine()] : lines;
}

const CATEGORY_OPTIONS = MAINTENANCE_PRICE_BOOK_CATEGORIES.map((c) => ({
  value: c,
  label: MAINTENANCE_PRICE_BOOK_CATEGORY_LABELS[c],
}));

const UNIT_OPTIONS = MAINTENANCE_PRICE_BOOK_UNITS.map((u) => ({
  value: u,
  label: MAINTENANCE_PRICE_BOOK_UNIT_LABELS[u],
}));

const VAT_OPTIONS = MAINTENANCE_PRICE_BOOK_VAT_RATES.map((v) => ({
  value: v,
  label: MAINTENANCE_PRICE_BOOK_VAT_LABELS[v],
}));

export default function WorkOrderQuoteBuilderScreen() {
  const theme = useTheme();
  const themeColors = theme?.colors ?? colors;
  const isDark = !!theme?.isDark;
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<WorkOrdersStackParamList>>();
  const route = useRoute<RouteProp<WorkOrdersStackParamList, 'WorkOrderQuoteBuilder'>>();
  const { workOrderId, quoteId: routeQuoteId } = route.params;
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canEditRecipient =
    user?.role === 'owner' || user?.role === 'maintenance_admin';
  const canSendQuote = canEditRecipient || user?.role === 'contractor';
  const canConvertQuote = canSendQuote;

  const [quoteId, setQuoteId] = useState<string | undefined>(routeQuoteId);
  const [bootError, setBootError] = useState<string | null>(null);
  const [booting, setBooting] = useState(!routeQuoteId);
  const bootStarted = useRef(false);

  const [recipientUserId, setRecipientUserId] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<EditableLine[]>([blankLine()]);
  const [hydrated, setHydrated] = useState(false);

  const [priceBookOpen, setPriceBookOpen] = useState(false);
  const [priceBookLineIndex, setPriceBookLineIndex] = useState<number | null>(null);
  const [priceBookQuery, setPriceBookQuery] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');

  useEffect(() => {
    if (routeQuoteId || bootStarted.current) return;
    bootStarted.current = true;
    (async () => {
      try {
        const list = await quotesService.listQuotes(workOrderId);
        const draft = list.find((q) => q.status === 'draft');
        if (draft) {
          setQuoteId(draft.id);
        } else {
          const created = await quotesService.createQuote(workOrderId);
          setQuoteId(created.id);
        }
      } catch (e) {
        setBootError(e instanceof Error ? e.message : 'Failed to open quotation');
      } finally {
        setBooting(false);
      }
    })();
  }, [routeQuoteId, workOrderId]);

  const quoteQuery = useQuery({
    queryKey: ['work-order-quote', workOrderId, quoteId],
    queryFn: () => quotesService.getQuote(workOrderId, quoteId!),
    enabled: !!quoteId,
  });

  const candidatesQuery = useQuery({
    queryKey: ['work-order-customer-candidates', workOrderId],
    queryFn: () => quotesService.getCustomerCandidates(workOrderId),
    enabled: !!workOrderId,
  });

  useEffect(() => {
    const quote = quoteQuery.data;
    if (!quote || hydrated) return;
    setRecipientUserId(quote.recipientUserId ?? '');
    setRecipientName(quote.recipientName ?? '');
    setRecipientEmail(quote.recipientEmail ?? '');
    setNotes(quote.notes ?? '');
    const mapped = (quote.lines ?? []).map((l) => ({
      localId: l.id || uuidv4(),
      name: l.name || '',
      description: l.description || '',
      sku: l.sku || '',
      category: (l.category as MaintenancePriceBookCategory) || 'labour',
      unit: (l.unit as MaintenancePriceBookUnit) || 'hour',
      quantity: String(l.quantity ?? 1),
      unitPriceMajor: minorToMajorInput(l.unitPriceMinor ?? 0),
      vatRate: (l.vatRate as MaintenancePriceBookVatRate) || 'standard_20',
      priceBookItemId: l.priceBookItemId ?? null,
      linkedCatalogName: l.priceBookItemId ? l.name || null : null,
    }));
    setLines(ensureMinLine(mapped));
    setHydrated(true);
  }, [quoteQuery.data, hydrated]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(priceBookQuery), 300);
    return () => clearTimeout(t);
  }, [priceBookQuery]);

  const currency = quoteQuery.data?.currency || 'GBP';
  const editable = quoteQuery.data ? isQuoteEditable(quoteQuery.data.status) : true;

  const priceBookQueryResult = useQuery({
    queryKey: ['price-book-items', currency, debouncedQ],
    queryFn: () =>
      quotesService.searchPriceBook({
        currency,
        q: debouncedQ,
        active: true,
      }),
    enabled: priceBookOpen,
  });

  const computedLines = useMemo(
    () =>
      lines.map((line) =>
        computeQuoteLine({
          quantity: Number(line.quantity) || 0,
          unitPriceMinor: majorInputToMinor(line.unitPriceMajor),
          vatRate: line.vatRate,
        }),
      ),
    [lines],
  );

  const totals = useMemo(() => computeQuoteTotals(computedLines), [computedLines]);

  const updateLine = useCallback((index: number, patch: Partial<EditableLine>) => {
    setLines((prev) =>
      ensureMinLine(
        prev.map((line, i) => {
          if (i !== index) return line;
          const merged = { ...line, ...patch };
          if (
            merged.priceBookItemId &&
            merged.linkedCatalogName &&
            patch.name !== undefined &&
            patch.name.trim() !== merged.linkedCatalogName.trim()
          ) {
            merged.priceBookItemId = null;
            merged.linkedCatalogName = null;
          }
          return merged;
        }),
      ),
    );
  }, []);

  const removeLine = useCallback((index: number) => {
    setLines((prev) => ensureMinLine(prev.filter((_, i) => i !== index)));
  }, []);

  const addLine = useCallback(() => {
    setLines((prev) => [...prev, blankLine()]);
  }, []);

  const applyPriceBook = useCallback(
    (item: PriceBookItem) => {
      if (priceBookLineIndex == null) return;
      updateLine(priceBookLineIndex, {
        name: item.name,
        description: item.description || '',
        sku: item.sku || '',
        category: item.category as MaintenancePriceBookCategory,
        unit: item.unit as MaintenancePriceBookUnit,
        unitPriceMajor: minorToMajorInput(item.defaultUnitPriceMinor),
        vatRate: item.vatRate as MaintenancePriceBookVatRate,
        priceBookItemId: item.id,
        linkedCatalogName: item.name,
      });
      setPriceBookOpen(false);
      setPriceBookLineIndex(null);
      setPriceBookQuery('');
    },
    [priceBookLineIndex, updateLine],
  );

  const toWriteLines = useCallback((): QuoteLineWrite[] => {
    return lines
      .filter((l) => l.name.trim().length > 0)
      .map((l) => ({
        name: l.name.trim(),
        description: l.description.trim() || null,
        sku: l.sku.trim() || null,
        category: l.category,
        unit: l.unit,
        quantity: Number(l.quantity) || 0,
        unitPriceMinor: majorInputToMinor(l.unitPriceMajor),
        vatRate: l.vatRate,
        priceBookItemId: l.priceBookItemId,
      }));
  }, [lines]);

  const customerOptions = useMemo(
    () =>
      (candidatesQuery.data?.candidates ?? []).map((c) => ({
        value: c.id,
        label: c.email ? `${c.displayName} (${c.email})` : c.displayName,
      })),
    [candidatesQuery.data?.candidates],
  );

  const applyCustomer = useCallback(
    (userId: string) => {
      setRecipientUserId(userId);
      const candidate = candidatesQuery.data?.candidates.find((c) => c.id === userId);
      if (candidate) {
        setRecipientName(candidate.displayName);
        setRecipientEmail(candidate.email || '');
      }
    },
    [candidatesQuery.data?.candidates],
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!quoteId) throw new Error('Quote not ready');
      await quotesService.patchQuote(workOrderId, quoteId, {
        ...(canEditRecipient
          ? {
              recipientUserId: recipientUserId || null,
              recipientName: recipientName.trim() || null,
              recipientEmail: recipientEmail.trim() || null,
            }
          : {}),
        notes: notes.trim() || null,
      });
      return quotesService.putLines(workOrderId, quoteId, toWriteLines());
    },
    onSuccess: (quote) => {
      queryClient.setQueryData(['work-order-quote', workOrderId, quoteId], quote);
      queryClient.invalidateQueries({ queryKey: ['work-order-quotes', workOrderId] });
      Alert.alert('Saved', 'Draft quotation saved');
    },
    onError: (err: Error) => {
      Alert.alert('Save failed', err.message || 'Please try again');
    },
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!quoteId) throw new Error('Quote not ready');
      const isResend = quoteQuery.data?.status === 'sent';
      if (!isResend) {
        const named = toWriteLines();
        if (named.length === 0) {
          throw new Error('Add at least one named line before sending');
        }
        if (!recipientName.trim() || !recipientEmail.trim()) {
          throw new Error(
            canEditRecipient
              ? 'Select a customer with name and email before sending'
              : 'An admin must set the customer before you can send',
          );
        }
        await quotesService.patchQuote(workOrderId, quoteId, {
          ...(canEditRecipient
            ? {
                recipientUserId: recipientUserId || null,
                recipientName: recipientName.trim() || null,
                recipientEmail: recipientEmail.trim() || null,
              }
            : {}),
          notes: notes.trim() || null,
        });
        await quotesService.putLines(workOrderId, quoteId, named);
      }
      return quotesService.sendQuote(workOrderId, quoteId);
    },
    onSuccess: (quote) => {
      queryClient.setQueryData(['work-order-quote', workOrderId, quoteId], quote);
      queryClient.invalidateQueries({ queryKey: ['work-order-quotes', workOrderId] });
      setHydrated(false);
      const emailFailed = quote.emailSent === false;
      Alert.alert(
        emailFailed ? 'Link created — email failed' : 'Sent to customer',
        emailFailed
          ? quote.emailError || 'Share the public link manually if needed.'
          : 'The customer received an email with a View & respond link.',
        [
          {
            text: 'OK',
            onPress: () => navigation.navigate('WorkOrderQuotes', { workOrderId }),
          },
        ],
      );
    },
    onError: (err: Error) => {
      Alert.alert('Send failed', err.message || 'Please try again');
    },
  });

  const convertMutation = useMutation({
    mutationFn: async () => {
      if (!quoteId) throw new Error('Quote not ready');
      return quotesService.convertToInvoice(workOrderId, quoteId);
    },
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ['work-order-quotes', workOrderId] });
      queryClient.invalidateQueries({ queryKey: ['work-order-quote', workOrderId, quoteId] });
      setHydrated(false);
      Alert.alert(
        'Invoice created',
        invoice.invoiceReference
          ? `Draft invoice ${invoice.invoiceReference} created.`
          : 'Draft invoice created from this quotation.',
        [
          {
            text: 'OK',
            onPress: () => navigation.navigate('WorkOrderQuotes', { workOrderId }),
          },
        ],
      );
    },
    onError: (err: Error) => {
      Alert.alert('Convert failed', err.message || 'Please try again');
    },
  });

  const handleSend = () => {
    Alert.alert(
      'Send to customer?',
      'The selected customer will receive an email with a secure link to view and respond.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send', onPress: () => sendMutation.mutate() },
      ],
    );
  };

  const handleConvert = () => {
    Alert.alert(
      'Convert to invoice?',
      'This creates a draft invoice from the accepted quotation.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Convert', onPress: () => convertMutation.mutate() },
      ],
    );
  };

  if (booting) {
    return (
      <View style={[styles.centered, { backgroundColor: themeColors.background }]}>
        <LoadingSpinner />
        <Text style={{ color: themeColors.text.secondary, marginTop: spacing[3] }}>
          Opening quotation…
        </Text>
      </View>
    );
  }

  if (bootError) {
    return (
      <View style={[styles.centered, { backgroundColor: themeColors.background, padding: spacing[6] }]}>
        <Text style={{ color: themeColors.text.primary, marginBottom: spacing[3] }}>{bootError}</Text>
        <Button title="Go back" onPress={() => navigation.goBack()} />
      </View>
    );
  }

  if (quoteQuery.isLoading || !hydrated) {
    return (
      <View style={[styles.centered, { backgroundColor: themeColors.background }]}>
        <LoadingSpinner />
      </View>
    );
  }

  if (quoteQuery.isError || !quoteQuery.data) {
    return (
      <View style={[styles.centered, { backgroundColor: themeColors.background, padding: spacing[6] }]}>
        <Text style={{ color: themeColors.text.primary, marginBottom: spacing[3] }}>
          Failed to load quotation
        </Text>
        <Button title="Retry" onPress={() => quoteQuery.refetch()} />
      </View>
    );
  }

  const quote = quoteQuery.data;
  const busy =
    saveMutation.isPending || sendMutation.isPending || convertMutation.isPending;
  const showConvert =
    canConvertQuote && quoteQuery.data?.status === 'accepted';
  const showResend =
    canSendQuote && quoteQuery.data?.status === 'sent';
  const statusText =
    MAINTENANCE_QUOTE_STATUS_LABELS[quote.status] || quote.status.replace(/_/g, ' ');

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: themeColors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + spacing[2],
            backgroundColor: themeColors.card.DEFAULT,
            borderBottomColor: themeColors.border.DEFAULT,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ArrowLeft size={22} color={themeColors.text.primary} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: themeColors.text.primary }]} numberOfLines={1}>
            {quote.quoteReference}
          </Text>
          <Text style={[styles.subtitle, { color: themeColors.text.secondary }]}>
            {statusText}
            {quote.context?.issueTitle ? ` · ${quote.context.issueTitle}` : ''}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingBottom:
              insets.bottom +
              (editable || showConvert || showResend ? 140 : spacing[8]),
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {!editable ? (
          <Card style={styles.section}>
            <Text style={[styles.readOnlyBanner, { color: themeColors.text.secondary }]}>
              {showConvert
                ? 'This quotation is accepted. You can convert it to an invoice below.'
                : showResend
                  ? 'Awaiting customer response. You can resend the email link below.'
                  : 'This quotation is not editable while awaiting a customer response.'}
            </Text>
          </Card>
        ) : null}

        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>Customer</Text>
          {editable && canEditRecipient ? (
            <View style={styles.fieldBlock}>
              <Text style={[styles.fieldLabel, { color: themeColors.text.secondary }]}>
                Customer
              </Text>
              <Select
                value={recipientUserId || undefined}
                options={customerOptions}
                onValueChange={applyCustomer}
                disabled={busy || candidatesQuery.isLoading}
                placeholder={
                  candidatesQuery.isLoading ? 'Loading…' : 'Select customer'
                }
                testID="select-quote-customer"
              />
              {!recipientUserId && recipientName ? (
                <Text style={[styles.hint, { color: themeColors.text.muted }]}>
                  Current: {recipientName}
                </Text>
              ) : null}
            </View>
          ) : (
            <Input label="Customer" value={recipientName} editable={false} />
          )}
          <Input
            label="Email"
            value={recipientEmail}
            onChangeText={setRecipientEmail}
            editable={editable && canEditRecipient && !busy}
            placeholder="customer@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Input
            label="Notes"
            value={notes}
            onChangeText={setNotes}
            editable={editable && !busy}
            placeholder="Optional notes"
            multiline
          />
        </Card>

        <View style={styles.linesHeader}>
          <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>Line items</Text>
          {editable ? (
            <TouchableOpacity onPress={addLine} disabled={busy} style={styles.addLineBtn}>
              <Plus size={16} color={themeColors.primary.DEFAULT} />
              <Text style={{ color: themeColors.primary.DEFAULT, fontWeight: '600' }}>Add</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {lines.map((line, index) => {
          const maths = computedLines[index];
          return (
            <Card key={line.localId} style={styles.lineCard}>
              <View style={styles.lineTop}>
                <Text style={[styles.lineIndex, { color: themeColors.text.secondary }]}>
                  Line {index + 1}
                </Text>
                {editable && lines.length > 1 ? (
                  <TouchableOpacity onPress={() => removeLine(index)} disabled={busy}>
                    <Trash2 size={18} color="#DC2626" />
                  </TouchableOpacity>
                ) : null}
              </View>

              <Input
                label="Name"
                value={line.name}
                onChangeText={(t) => updateLine(index, { name: t })}
                editable={editable && !busy}
                placeholder="Item name"
              />
              {editable ? (
                <TouchableOpacity
                  style={[
                    styles.priceBookBtn,
                    {
                      borderColor: themeColors.border.DEFAULT,
                      backgroundColor: isDark ? themeColors.card.DEFAULT : '#F8FAFC',
                    },
                  ]}
                  onPress={() => {
                    setPriceBookLineIndex(index);
                    setPriceBookOpen(true);
                  }}
                  disabled={busy}
                >
                  <Search size={14} color={themeColors.primary.DEFAULT} />
                  <Text style={{ color: themeColors.primary.DEFAULT, fontSize: getFontSize(13) }}>
                    Search price book
                  </Text>
                </TouchableOpacity>
              ) : null}

              <Select
                value={line.category}
                options={CATEGORY_OPTIONS}
                onValueChange={(v) =>
                  updateLine(index, { category: v as MaintenancePriceBookCategory })
                }
                disabled={!editable || busy}
              />
              <View style={styles.row2}>
                <View style={styles.half}>
                  <Input
                    label="Qty"
                    value={line.quantity}
                    onChangeText={(t) => updateLine(index, { quantity: t })}
                    editable={editable && !busy}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.half}>
                  <Text style={[styles.fieldLabel, { color: themeColors.text.secondary }]}>Unit</Text>
                  <Select
                    value={line.unit}
                    options={UNIT_OPTIONS}
                    onValueChange={(v) =>
                      updateLine(index, { unit: v as MaintenancePriceBookUnit })
                    }
                    disabled={!editable || busy}
                  />
                </View>
              </View>
              <View style={styles.row2}>
                <View style={styles.half}>
                  <Input
                    label="Unit price"
                    value={line.unitPriceMajor}
                    onChangeText={(t) => updateLine(index, { unitPriceMajor: t })}
                    editable={editable && !busy}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.half}>
                  <Text style={[styles.fieldLabel, { color: themeColors.text.secondary }]}>VAT</Text>
                  <Select
                    value={line.vatRate}
                    options={VAT_OPTIONS}
                    onValueChange={(v) =>
                      updateLine(index, { vatRate: v as MaintenancePriceBookVatRate })
                    }
                    disabled={!editable || busy}
                  />
                </View>
              </View>
              <Text style={[styles.lineTotal, { color: themeColors.text.secondary }]}>
                Line total {formatMoneyMinor(maths?.lineTotalMinor ?? 0, currency)}
              </Text>
            </Card>
          );
        })}

        <Card style={styles.totalsCard}>
          <View style={styles.totalRow}>
            <Text style={{ color: themeColors.text.secondary }}>Subtotal</Text>
            <Text style={{ color: themeColors.text.primary }}>
              {formatMoneyMinor(totals.subtotalMinor, currency)}
            </Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={{ color: themeColors.text.secondary }}>VAT</Text>
            <Text style={{ color: themeColors.text.primary }}>
              {formatMoneyMinor(totals.taxMinor, currency)}
            </Text>
          </View>
          <View style={[styles.totalRow, styles.totalProposed]}>
            <Text style={[styles.totalLabel, { color: themeColors.text.primary }]}>
              Total proposed
            </Text>
            <Text style={[styles.totalValue, { color: themeColors.primary.DEFAULT }]}>
              {formatMoneyMinor(totals.totalMinor, currency)}
            </Text>
          </View>
        </Card>
      </ScrollView>

      {editable || showConvert || showResend ? (
        <View
          style={[
            styles.footer,
            {
              paddingBottom: insets.bottom + spacing[3],
              backgroundColor: themeColors.card.DEFAULT,
              borderTopColor: themeColors.border.DEFAULT,
            },
          ]}
        >
          {editable ? (
            <>
              <Button
                title={saveMutation.isPending ? 'Saving…' : 'Save draft'}
                variant="outline"
                onPress={() => saveMutation.mutate()}
                disabled={busy}
                style={styles.footerBtn}
              />
              <Button
                title={sendMutation.isPending ? 'Sending…' : 'Send to customer'}
                onPress={handleSend}
                disabled={busy}
                style={styles.footerBtn}
              />
            </>
          ) : null}
          {showResend ? (
            <Button
              title={sendMutation.isPending ? 'Sending…' : 'Resend to customer'}
              onPress={handleSend}
              disabled={busy}
              style={styles.footerBtn}
            />
          ) : null}
          {showConvert ? (
            <Button
              title={
                convertMutation.isPending ? 'Converting…' : 'Convert to invoice'
              }
              onPress={handleConvert}
              disabled={busy}
              style={styles.footerBtn}
            />
          ) : null}
        </View>
      ) : null}

      <Modal
        visible={priceBookOpen}
        animationType="slide"
        onRequestClose={() => setPriceBookOpen(false)}
      >
        <View
          style={[
            styles.modal,
            {
              paddingTop: insets.top + spacing[2],
              paddingBottom: insets.bottom + spacing[2],
              backgroundColor: themeColors.background,
            },
          ]}
        >
          <View style={styles.modalHeader}>
            <Text style={[styles.title, { color: themeColors.text.primary }]}>Price book</Text>
            <TouchableOpacity onPress={() => setPriceBookOpen(false)}>
              <Text style={{ color: themeColors.primary.DEFAULT, fontWeight: '600' }}>Close</Text>
            </TouchableOpacity>
          </View>
          <Input
            value={priceBookQuery}
            onChangeText={setPriceBookQuery}
            placeholder="Search items…"
            autoFocus
          />
          {priceBookQueryResult.isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={themeColors.primary.DEFAULT} />
            </View>
          ) : (
            <FlatList
              data={priceBookQueryResult.data ?? []}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text
                  style={{
                    color: themeColors.text.secondary,
                    textAlign: 'center',
                    marginTop: spacing[6],
                  }}
                >
                  No matching items
                </Text>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.priceBookItem,
                    { borderBottomColor: themeColors.border.DEFAULT },
                  ]}
                  onPress={() => applyPriceBook(item)}
                >
                  <Text style={{ color: themeColors.text.primary, fontWeight: '600' }}>
                    {item.name}
                  </Text>
                  <Text style={{ color: themeColors.text.secondary, marginTop: 2 }}>
                    {MAINTENANCE_PRICE_BOOK_CATEGORY_LABELS[
                      item.category as MaintenancePriceBookCategory
                    ] || item.category}
                    {' · '}
                    {formatMoneyMinor(item.defaultUnitPriceMinor, item.currency || currency)}
                  </Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing[2],
  },
  backBtn: { paddingTop: spacing[1], paddingRight: spacing[1] },
  headerText: { flex: 1 },
  title: {
    fontSize: getFontSize(18),
    fontWeight: '700',
  },
  subtitle: {
    fontSize: getFontSize(13),
    marginTop: 2,
  },
  scroll: {
    padding: spacing[4],
    gap: spacing[3],
  },
  section: {
    marginBottom: spacing[3],
    gap: spacing[2],
  },
  sectionTitle: {
    fontSize: getFontSize(16),
    fontWeight: '700',
    marginBottom: spacing[2],
  },
  readOnlyBanner: {
    fontSize: getFontSize(13),
    lineHeight: 18,
  },
  linesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[2],
  },
  addLineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  lineCard: {
    marginBottom: spacing[3],
    gap: spacing[2],
    ...shadows.sm,
  },
  lineTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lineIndex: {
    fontSize: getFontSize(12),
    fontWeight: '600',
  },
  priceBookBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: borderRadius.md,
    marginBottom: spacing[1],
  },
  row2: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  half: { flex: 1 },
  fieldBlock: {
    marginBottom: spacing[1],
  },
  fieldLabel: {
    fontSize: getFontSize(13),
    marginBottom: spacing[1],
  },
  hint: {
    fontSize: getFontSize(12),
    marginTop: spacing[1],
  },
  lineTotal: {
    fontSize: getFontSize(13),
    textAlign: 'right',
    marginTop: spacing[1],
  },
  totalsCard: {
    marginTop: spacing[2],
    gap: spacing[2],
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalProposed: {
    marginTop: spacing[2],
    paddingTop: spacing[2],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
  totalLabel: {
    fontSize: getFontSize(16),
    fontWeight: '700',
  },
  totalValue: {
    fontSize: getFontSize(18),
    fontWeight: '800',
  },
  footer: {
    flexDirection: 'row',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerBtn: { flex: 1 },
  modal: {
    flex: 1,
    paddingHorizontal: spacing[4],
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[3],
  },
  priceBookItem: {
    paddingVertical: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
