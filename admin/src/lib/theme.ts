export type Theme = 'light' | 'dark';

let currentTheme: Theme = 'light';

export function setTheme(theme: Theme) {
    currentTheme = theme;
    localStorage.setItem('theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
}

export function getTheme(): Theme {
    return currentTheme;
}

export function initTheme() {
    const saved = localStorage.getItem('theme') as Theme;
    currentTheme = saved || 'light';
    document.documentElement.setAttribute('data-theme', currentTheme);
}
