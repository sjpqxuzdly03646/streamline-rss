import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'worker/**'],
  },
  js.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  prettier,
  {
    files: ['**/*.{js,vue}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-control-regex': 'off', // rss.js 需用控制字符正则清洗非法 XML 字符
      'vue/multi-word-component-names': 'off',
      'vue/no-v-html': 'off', // 正文由清洗后的 HTML 渲染, 已有 sanitizeHtml 防护
      'vue/require-default-prop': 'off',
    },
  },
]