import { Button, Card, createTheme, NavLink, Paper, TextInput, type CSSVariablesResolver, type MantineColorsTuple } from '@mantine/core';

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

/**
 * Nền tối: xám ánh chàm thay cho xám trung tính mặc định — hợp với màu tím thương hiệu, dịu mắt hơn.
 * Mantine dùng: [0] chữ, [2] chữ mờ (dimmed), [4] viền input, [5] viền card, [6] hover, [7] nền card/body, [8] nền app.
 */
const dark: MantineColorsTuple = [
  '#d4d6e2',
  '#b4b7c9',
  '#9094ab',
  '#6b6f86',
  '#4a4e62',
  '#383c4e',
  '#2c2f3e',
  '#232634',
  '#1b1d29',
  '#14161f',
];

export const theme = createTheme({
  primaryColor: 'brand',
  // Nền tối dùng tông trầm (7) cho nút/badge "filled": dịu mắt hơn mà chữ trắng vẫn đủ tương phản
  primaryShade: { light: 6, dark: 7 },
  colors: { brand, dark },
  // Chữ xám than thay cho đen tuyền — đỡ tương phản gắt trên nền sáng
  black: '#262a3b',
  white: '#ffffff',
  fontFamily: "'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  fontFamilyMonospace: "'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace",
  headings: { fontFamily: "'Be Vietnam Pro', sans-serif", fontWeight: '700' },
  defaultRadius: 'md',
  defaultGradient: { from: 'brand.6', to: 'violet.6', deg: 135 },
  shadows: {
    xs: '0 1px 2px rgba(30, 34, 60, 0.05)',
    sm: '0 1px 3px rgba(30, 34, 60, 0.06), 0 1px 2px rgba(30, 34, 60, 0.04)',
    md: '0 6px 16px rgba(30, 34, 60, 0.08), 0 2px 4px rgba(30, 34, 60, 0.04)',
    lg: '0 12px 28px rgba(30, 34, 60, 0.10), 0 4px 8px rgba(30, 34, 60, 0.05)',
    xl: '0 20px 40px rgba(30, 34, 60, 0.12), 0 8px 16px rgba(30, 34, 60, 0.06)',
  },
  cursorType: 'pointer',
  components: {
    Button: Button.extend({ defaultProps: { radius: 'md' } }),
    TextInput: TextInput.extend({ defaultProps: { radius: 'md', size: 'md' } }),
    Card: Card.extend({ defaultProps: { radius: 'lg', withBorder: true } }),
    Paper: Paper.extend({ defaultProps: { radius: 'lg' } }),
    NavLink: NavLink.extend({ defaultProps: { variant: 'light' } }),
  },
});

/** Màu nền / chữ / viền riêng cho từng theme (ghi đè biến CSS của Mantine). */
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: {
    // Card/Paper trắng ngà thay vì trắng tinh
    '--mantine-color-body': '#fcfcfe',
    '--mantine-color-text': '#262a3b',
    '--mantine-color-dimmed': '#6e7387',
    '--mantine-color-default-border': '#e2e4ee',
    '--mantine-color-default-hover': '#f2f3f8',
  },
  dark: {
    '--mantine-color-body': '#232634',
    '--mantine-color-text': '#d4d6e2',
    '--mantine-color-dimmed': '#8d91a8',
    '--mantine-color-default': '#2a2d3c',
    '--mantine-color-default-hover': '#313546',
    '--mantine-color-default-border': '#3a3e51',
  },
});
