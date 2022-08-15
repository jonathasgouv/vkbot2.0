module.exports = {
  presets: [
    [
      '@babel/preset-env',
      {
        targets: {
          node: 'current'
        }
      }
    ],
    '@babel/preset-typescript'
  ],
  plugins: [
    ['module-resolver', {
      alias: {
        '@config': './src/config',
        '@models': './src/models',
        '@routes': './src/routes',
        '@controllers': './src/controllers',
        '@views': './src/views',
        '@api': ['./src/api'],
        '@utils': ['./src/utils'],
        '@crons': ['./src/crons'],
        '@types': ['./src/types']
      }
    }]
  ],
  ignore: [
    '**/*.spec.ts'
  ]
}
