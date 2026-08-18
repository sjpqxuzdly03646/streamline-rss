/**
 * Streamline RSS 设计令牌 → Tailwind 映射
 *
 * 全部颜色令牌都映射到 CSS 变量 (rgb 分量), 亮暗两套主题通过
 * :root / .dark 切换, 因此任何 bg / text / border 工具类都会
 * 随主题自动变化, 无需 dark: 前缀。
 *
 * 来源: vivid_stream(DARK) + rss_1/rss_3(暗色 UI) / vivid_stream_light(LIGHT) + rss_2/rss_v2(亮色 UI)
 */

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{vue,js}'],
  // 这些类由 Vue 的 <Transition> 在运行时生成, 源码中不存在对应字符串,
  // 不加入 safelist 就会被 JIT 从 @layer components 中清除 → 动画/过渡永远不结束
  safelist: [
    'page-enter-active',
    'page-leave-active',
    'page-enter-from',
    'page-leave-to',
    'fade-enter-active',
    'fade-leave-active',
    'fade-enter-from',
    'fade-leave-to',
    'modal-enter-active',
    'modal-leave-active',
    'modal-enter-from',
    'modal-leave-to',
  ],
  theme: {
    extend: {
      colors: {
        // ---- Surface 层级 ----
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-dim': 'rgb(var(--surface-dim) / <alpha-value>)',
        'surface-bright': 'rgb(var(--surface-bright) / <alpha-value>)',
        'surface-container-lowest': 'rgb(var(--surface-container-lowest) / <alpha-value>)',
        'surface-container-low': 'rgb(var(--surface-container-low) / <alpha-value>)',
        'surface-container': 'rgb(var(--surface-container) / <alpha-value>)',
        'surface-container-high': 'rgb(var(--surface-container-high) / <alpha-value>)',
        'surface-container-highest': 'rgb(var(--surface-container-highest) / <alpha-value>)',
        'on-surface': 'rgb(var(--on-surface) / <alpha-value>)',
        'on-surface-variant': 'rgb(var(--on-surface-variant) / <alpha-value>)',
        'on-surface-muted': 'rgb(var(--on-surface-muted) / <alpha-value>)',
        'inverse-surface': 'rgb(var(--inverse-surface) / <alpha-value>)',
        'inverse-on-surface': 'rgb(var(--inverse-on-surface) / <alpha-value>)',
        'surface-variant': 'rgb(var(--surface-variant) / <alpha-value>)',
        'surface-tint': 'rgb(var(--surface-tint) / <alpha-value>)',
        // ---- 轮廓 / 分隔 ----
        outline: 'rgb(var(--outline) / <alpha-value>)',
        'outline-variant': 'rgb(var(--outline-variant) / <alpha-value>)',
        // ---- 背景 ----
        background: 'rgb(var(--background) / <alpha-value>)',
        'on-background': 'rgb(var(--on-background) / <alpha-value>)',
        // ---- Primary (品牌橙红渐变) ----
        primary: 'rgb(var(--primary) / <alpha-value>)',
        'on-primary': 'rgb(var(--on-primary) / <alpha-value>)',
        'primary-container': 'rgb(var(--primary-container) / <alpha-value>)',
        'on-primary-container': 'rgb(var(--on-primary-container) / <alpha-value>)',
        'inverse-primary': 'rgb(var(--inverse-primary) / <alpha-value>)',
        'primary-fixed': 'rgb(var(--primary-fixed) / <alpha-value>)',
        'primary-fixed-dim': 'rgb(var(--primary-fixed-dim) / <alpha-value>)',
        'on-primary-fixed': 'rgb(var(--on-primary-fixed) / <alpha-value>)',
        'on-primary-fixed-variant': 'rgb(var(--on-primary-fixed-variant) / <alpha-value>)',
        // ---- Secondary (琥珀橙) ----
        secondary: 'rgb(var(--secondary) / <alpha-value>)',
        'on-secondary': 'rgb(var(--on-secondary) / <alpha-value>)',
        'secondary-container': 'rgb(var(--secondary-container) / <alpha-value>)',
        'on-secondary-container': 'rgb(var(--on-secondary-container) / <alpha-value>)',
        'secondary-fixed': 'rgb(var(--secondary-fixed) / <alpha-value>)',
        'secondary-fixed-dim': 'rgb(var(--secondary-fixed-dim) / <alpha-value>)',
        'on-secondary-fixed': 'rgb(var(--on-secondary-fixed) / <alpha-value>)',
        'on-secondary-fixed-variant': 'rgb(var(--on-secondary-fixed-variant) / <alpha-value>)',
        // ---- Tertiary (蓝/中性) ----
        tertiary: 'rgb(var(--tertiary) / <alpha-value>)',
        'on-tertiary': 'rgb(var(--on-tertiary) / <alpha-value>)',
        'tertiary-container': 'rgb(var(--tertiary-container) / <alpha-value>)',
        'on-tertiary-container': 'rgb(var(--on-tertiary-container) / <alpha-value>)',
        'tertiary-fixed': 'rgb(var(--tertiary-fixed) / <alpha-value>)',
        'tertiary-fixed-dim': 'rgb(var(--tertiary-fixed-dim) / <alpha-value>)',
        'on-tertiary-fixed': 'rgb(var(--on-tertiary-fixed) / <alpha-value>)',
        'on-tertiary-fixed-variant': 'rgb(var(--on-tertiary-fixed-variant) / <alpha-value>)',
        // ---- Error ----
        error: 'rgb(var(--error) / <alpha-value>)',
        'on-error': 'rgb(var(--on-error) / <alpha-value>)',
        'error-container': 'rgb(var(--error-container) / <alpha-value>)',
        'on-error-container': 'rgb(var(--on-error-container) / <alpha-value>)',
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '1rem',
        full: '9999px',
      },
      spacing: {
        xs: '4px',
        sm: '12px',
        base: '8px',
        md: '24px',
        lg: '40px',
        xl: '64px',
        gutter: '24px',
        'margin-mobile': '16px',
        'margin-desktop': '48px',
      },
      maxWidth: {
        content: '800px',
      },
      fontFamily: {
        'display-lg': ['"Hanken Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
        'headline-md': ['"Hanken Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
        'headline-sm': ['"Hanken Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
        'headline-md-mobile': ['"Hanken Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
        'body-lg': ['Inter', 'system-ui', 'sans-serif'],
        'body-md': ['Inter', 'system-ui', 'sans-serif'],
        'body-sm': ['Inter', 'system-ui', 'sans-serif'],
        'label-caps': ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display-lg': ['48px', { lineHeight: '56px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'headline-sm': ['18px', { lineHeight: '24px', fontWeight: '600' }],
        'body-sm': ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'body-lg': ['18px', { lineHeight: '28px', fontWeight: '400' }],
        'headline-md': ['24px', { lineHeight: '32px', fontWeight: '600' }],
        'label-caps': ['12px', { lineHeight: '16px', letterSpacing: '0.05em', fontWeight: '500' }],
        'body-md': ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'headline-md-mobile': ['20px', { lineHeight: '28px', fontWeight: '600' }],
      },
    },
  },
  plugins: [],
}