import { createTheme, type MantineColorsTuple } from '@mantine/core';

const scoreplayGreen: MantineColorsTuple = [
  '#E6FFF3',
  '#B3FFD9',
  '#80FFC0',
  '#4DFFA6',
  '#1AFF8D',
  '#00FF87',
  '#00CC6C',
  '#009951',
  '#006637',
  '#00331C',
];

export const scoreplayTheme = createTheme({
  primaryColor: 'scoreplay-green',
  colors: {
    'scoreplay-green': scoreplayGreen,
  },
  black: '#0A0A0A',
  white: '#FAFAFA',
});
