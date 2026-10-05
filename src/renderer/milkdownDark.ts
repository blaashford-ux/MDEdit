import darkCss from '@milkdown/crepe/theme/classic-dark.css?inline';

// The dark theme only overrides colour variables, so it can ride on a media query: no JS needed to
// follow the OS, and Electron's nativeTheme.themeSource (View > Theme) flips the same media query.
const style = document.createElement('style');
style.media = '(prefers-color-scheme: dark)';
style.textContent = darkCss;
document.head.appendChild(style);
