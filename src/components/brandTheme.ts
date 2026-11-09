import { createTheme, ITheme } from '@fluentui/react';

/** Tema Fluent con i colori del logo AD Consulting (azzurro #0098FF, magenta #DB0B5B). */
export const brandTheme: ITheme = createTheme({
  palette: {
    themePrimary: '#0073c7',
    themeLighterAlt: '#f3f9fe',
    themeLighter: '#d5eafb',
    themeLight: '#b2d8f6',
    themeTertiary: '#6db2ec',
    themeSecondary: '#2e8bd4',
    themeDarkAlt: '#0066b0',
    themeDark: '#00568f',
    themeDarker: '#004069',
    neutralPrimary: '#1b2733',
    neutralSecondary: '#3a4856',
    neutralPrimaryAlt: '#4a5a69',
    neutralTertiary: '#7a8896',
    neutralTertiaryAlt: '#c3ccd5',
    neutralLight: '#eaeff4',
    neutralLighter: '#f3f6f9',
    neutralLighterAlt: '#f8fafc',
    neutralQuaternary: '#d3dae1',
    neutralQuaternaryAlt: '#dde3e9',
    neutralDark: '#25323f',
    black: '#0f1720',
    white: '#ffffff'
  },
  defaultFontStyle: {
    fontFamily: "'Segoe UI', 'Segoe UI Web (West European)', system-ui, -apple-system, Roboto, 'Helvetica Neue', sans-serif"
  },
  effects: {
    roundedCorner2: '8px',
    roundedCorner4: '12px',
    roundedCorner6: '16px'
  }
});
