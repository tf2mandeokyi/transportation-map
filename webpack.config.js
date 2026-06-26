const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const HtmlInlineScriptPlugin = require('html-inline-script-webpack-plugin');

module.exports = (env, argv) => {
  const mode = argv.mode === 'production' ? 'production' : 'development';

  return [
    // Plugin build configuration
    {
      name: 'plugin',
      mode,
      devtool: mode === 'production' ? false : 'inline-source-map',
      entry: {
        code: './src/plugin/code.ts',
      },
      module: {
        rules: [
          {
            test: /\.tsx?$/,
            use: { loader: 'ts-loader', options: { configFile: path.resolve(__dirname, 'tsconfig.json') } },
            exclude: /node_modules/,
          },
          {
            test: /\.(js|cjs)$/,
            include: /node_modules/,
            use: {
              loader: 'babel-loader',
              options: {
                presets: [['@babel/preset-env', { targets: { esmodules: false }, modules: false }]],
                comments: false,
              },
            },
          },
          {
            test: /\.figml$/,
            type: 'asset/source',
          },
        ],
      },
      resolve: {
        extensions: ['.ts', '.tsx', '.js'],
        alias: {
          '@': path.resolve(__dirname, 'src'),
        },
      },
      optimization: {
        minimize: true,
      },
      output: {
        filename: '[name].js',
        path: path.resolve(__dirname, 'dist'),
      },
    },
    // UI build configuration
    {
      name: 'ui',
      mode,
      devtool: mode === 'production' ? false : 'inline-source-map',
      entry: {
        ui: './src/ui/index.tsx',
      },
      module: {
        rules: [
          {
            test: /\.tsx?$/,
            use: { loader: 'ts-loader', options: { configFile: path.resolve(__dirname, 'tsconfig.json') } },
            exclude: /node_modules/,
          },
          {
            test: /\.css$/,
            use: ['style-loader', 'css-loader'],
          },
        ],
      },
      resolve: {
        extensions: ['.tsx', '.ts', '.js'],
        alias: {
          '@': path.resolve(__dirname, 'src'),
        },
      },
      output: {
        filename: '[name].js',
        path: path.resolve(__dirname, 'dist'),
      },
      plugins: [
        new HtmlWebpackPlugin({
          template: './src/ui/index.html',
          filename: 'ui.html',
          chunks: ['ui'],
          inject: 'body',
        }),
        new HtmlInlineScriptPlugin(),
      ],
    },
  ];
};