export default {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'body-min-lines': ({ body }) => {
          const lines = (body ?? '').split('\n').filter((l) => l.trim() !== '');
          return [
            lines.length >= 2,
            '본문은 최소 2줄 이상 작성해야 합니다 (빈 줄 제외)',
          ];
        },
      },
    },
  ],
  rules: {
    'subject-empty': [2, 'never'],
    'subject-case': [0],
    'type-enum': [2, 'always', ['feat', 'fix', 'docs', 'style', 'refactor', 'test', 'chore', 'perf']],
    'body-min-lines': [2, 'always'],
  },
};
