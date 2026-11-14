// Flat ESLint configuration for GJS / GNOME Shell extension
export default [
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                // GJS and GNOME Shell globals
                global: 'readonly',
                globalThis: 'readonly',
                _: 'readonly',
                C_: 'readonly',
                N_: 'readonly',
                ngettext: 'readonly',
                log: 'readonly',
                logError: 'readonly',
                print: 'readonly',
                printerr: 'readonly',
                console: 'readonly',
            },
        },
        rules: {
            'no-undef': 'error',
            'no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
            }],
            'no-var': 'error',
            'prefer-const': 'error',
            'semi': ['error', 'always'],
            'quotes': ['error', 'single', {avoidEscape: true}],
            'indent': ['error', 4, {SwitchCase: 1}],
            'no-trailing-spaces': 'error',
            'eol-last': ['error', 'always'],
        },
    },
];
