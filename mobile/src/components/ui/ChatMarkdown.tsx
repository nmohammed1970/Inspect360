import React, { type ReactNode } from 'react';
import { Linking, StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';
import { getFontSize } from '../../utils/responsive';

type ChatMarkdownProps = {
  content: string;
  color: string;
  /** Base text size; defaults to 14 scaled */
  fontSize?: number;
  style?: ViewStyle;
};

/**
 * Lightweight markdown for AI chat bubbles: **bold**, *italic*, `code`,
 * headers, bullet/numbered lists, and links.
 */
export default function ChatMarkdown({ content, color, fontSize, style }: ChatMarkdownProps) {
  const size = fontSize ?? getFontSize(14);
  const lineHeight = Math.round(size * 1.45);
  const lines = (content || '').replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let listBuf: { ordered: boolean; items: string[]; start: number } | null = null;

  const baseText: TextStyle = { color, fontSize: size, lineHeight };

  const flushList = () => {
    if (!listBuf) return;
    const { ordered, items, start } = listBuf;
    blocks.push(
      <View key={`list-${blocks.length}`} style={styles.list}>
        {items.map((item, idx) => (
          <View key={idx} style={styles.listRow}>
            <Text style={[baseText, styles.listMarker]}>
              {ordered ? `${start + idx}.` : '•'}
            </Text>
            <Text style={[baseText, styles.listItem]}>{renderInline(item, color, size)}</Text>
          </View>
        ))}
      </View>,
    );
    listBuf = null;
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      blocks.push(<View key={`br-${i}`} style={styles.spacer} />);
      i += 1;
      continue;
    }

    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    const bulletMatch = trimmed.match(/^[-*+]\s+(.*)$/);
    if (orderedMatch || bulletMatch) {
      const ordered = !!orderedMatch;
      const text = orderedMatch ? orderedMatch[2] : bulletMatch![1];
      const start = orderedMatch ? parseInt(orderedMatch[1], 10) : 1;
      if (!listBuf || listBuf.ordered !== ordered) {
        flushList();
        listBuf = { ordered, items: [], start };
      }
      listBuf.items.push(text);
      i += 1;
      continue;
    }

    flushList();

    const heading = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const headingSize = level === 1 ? size + 2 : size + 1;
      blocks.push(
        <Text
          key={`h-${i}`}
          style={{
            color,
            fontSize: headingSize,
            lineHeight: Math.round(headingSize * 1.4),
            fontWeight: '700',
            marginTop: 4,
            marginBottom: 2,
          }}
        >
          {renderInline(heading[2], color, headingSize)}
        </Text>,
      );
      i += 1;
      continue;
    }

    blocks.push(
      <Text key={`p-${i}`} style={baseText}>
        {renderInline(trimmed, color, size)}
      </Text>,
    );
    i += 1;
  }

  flushList();

  return <View style={style}>{blocks}</View>;
}

function renderInline(text: string, color: string, fontSize: number): ReactNode[] {
  const pattern =
    /(\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`|\*([^*]+)\*|_([^_]+)_)/g;
  const nodes: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index));
    }

    if (match[2] && match[3]) {
      const url = match[3];
      nodes.push(
        <Text
          key={`a-${key++}`}
          style={{ color, textDecorationLine: 'underline', fontSize }}
          onPress={() => {
            void Linking.openURL(url).catch(() => {});
          }}
        >
          {match[2]}
        </Text>,
      );
    } else if (match[4] || match[5]) {
      nodes.push(
        <Text key={`b-${key++}`} style={{ color, fontWeight: '700', fontSize }}>
          {match[4] || match[5]}
        </Text>,
      );
    } else if (match[6]) {
      nodes.push(
        <Text
          key={`c-${key++}`}
          style={{
            color,
            fontFamily: 'monospace',
            fontSize: fontSize * 0.9,
            backgroundColor: 'rgba(0,0,0,0.08)',
          }}
        >
          {match[6]}
        </Text>,
      );
    } else if (match[7] || match[8]) {
      nodes.push(
        <Text key={`i-${key++}`} style={{ color, fontStyle: 'italic', fontSize }}>
          {match[7] || match[8]}
        </Text>,
      );
    }

    last = match.index + match[0].length;
  }

  if (last < text.length) {
    nodes.push(text.slice(last));
  }

  return nodes.length > 0 ? nodes : [text];
}

const styles = StyleSheet.create({
  spacer: { height: 8 },
  list: { marginVertical: 4, gap: 4 },
  listRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  listMarker: { width: 22, textAlign: 'right' },
  listItem: { flex: 1 },
});
