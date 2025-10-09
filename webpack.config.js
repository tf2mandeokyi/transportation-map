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
            use: 'ts-loader',
            exclude: /node_modules/,
          },
          {
            test: /\.figml$/,
            type: 'asset/source',
          },
        ],
      },
      resolve: {
        extensions: ['.ts', '.tsx', '.js'],
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
            use: 'ts-loader',
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