import { Button, Card, createTheme, NavLink, Paper, TextInput, type MantineColorsTuple } from '@mantine/core';

/** Màu thương hiệu: tím-xanh (indigo/violet). */
const brand: MantineColorsTuple = [
  '#eef0ff',
  '#dcdfff',
  '#b6bcff',
  '#8d96ff',
  '#6b75fe',
  '#5561fe',
  '#4955fe',
  '#3a46e3',
  '#313ecb',
  '#2534b3',
];

export const theme = createTheme({
  primaryColor: 'brand',
  primaryShade: { light: 6, dark: 5 },
  colors: { brand },
  fontFamily: "'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  fontFamilyMonospace: "'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace",
  headings: { fontFamily: "'Be Vietnam Pro', sans-serif", fontWeight: '700' },
  defaultRadius: 'md',
  defaultGradient: { from: 'brand.6', to: 'violet.6', deg: 135 },
  cursorType: 'pointer',
  components: {
    Button: Button.extend({ defaultProps: { radius: 'md' } }),
    TextInput: TextInput.extend({ defaultProps: { radius: 'md', size: 'md' } }),
    Card: Card.extend({ defaultProps: { radius: 'lg', withBorder: true } }),
    Paper: Paper.extend({ defaultProps: { radius: 'lg' } }),
    NavLink: NavLink.extend({ defaultProps: { variant: 'light' } }),
  },
});
