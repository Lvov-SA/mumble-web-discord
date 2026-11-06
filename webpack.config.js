var theme = '../themes/MetroMumbleLight'
var path = require('path');
var webpack = require('webpack');
var extractLoader = path.resolve(__dirname, 'build/extract-loader.cjs');

module.exports = {
  mode: 'development',
  entry: {
    index: [
      './app/index.js',
      './app/index.html'
    ],
    config: './app/config.js',
    theme: './app/theme.js',
    matrix: './app/matrix.js'
  },
  devtool: "cheap-source-map",
  output: {
    path: path.join(__dirname, 'dist'),
    publicPath: '',
    chunkFilename: '[chunkhash].js',
    filename: '[name].js'
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
            plugins: ['@babel/plugin-transform-runtime']
          }
        }
      },
      {
        test: /\.html$/,
        use: [
          {
            loader: 'file-loader',
            options: { name: '[name].[ext]', esModule: false }
          },
          {
            loader: extractLoader
          },
          {
            loader: 'html-loader',
            options: {
              esModule: false,
              minimize: false,
              sources: {
                list: [
                  { tag: 'img', attribute: 'src', type: 'src' },
                  { tag: 'link', attribute: 'href', type: 'src' },
                  { tag: 'meta', attribute: 'content', type: 'src',
                    filter: (tag, attribute, attributes) => attributes.some(
                      attr => attr.name === 'name' && attr.value === 'msapplication-config') }
                ]
              },
              // html-loader treats script bodies as raw text, including
              // Knockout's text/html templates. Expose their markup during
              // asset discovery, then restore script tags for Knockout.
              preprocessor: content => content
                .replace(/<script\b([^>]*\btype="text\/html"[^>]*)>([\s\S]*?)<\/script>/g,
                  '<mumble-build-template$1>$2</mumble-build-template>')
                .replace(/src="\/svg\//g, `src="${theme}/svg/`),
              postprocessor: content => content
                .replace(/<mumble-build-template\b/g, '<script')
                .replace(/<\/mumble-build-template>/g, '</script>')
            }
          }
        ]
      },
      {
        test: /\.css$/,
        use: [
          { loader: 'file-loader', options: { esModule: false } },
          extractLoader,
          { loader: 'css-loader', options: { esModule: false } }
        ]
      },
      {
        test: /\.scss$/,
        use: [
          { loader: 'file-loader', options: { name: '[contenthash].css', esModule: false } },
          extractLoader,
          { loader: 'css-loader', options: { esModule: false } },
          {
            loader: 'sass-loader',
            options: { implementation: require('sass'), api: 'legacy' }
          }
        ]
      },
      {
        type: 'javascript/auto',
        test: /manifest\.json$|\.xml$/,
        use: [
          { loader: 'file-loader', options: { esModule: false } },
          extractLoader,
          {
            loader: 'regexp-replace-loader',
            options: {
              match: {
                pattern: "#require\\('([^']*)'\\)",
                flags: 'g'
              },
              replaceWith: '"+require("$1")+"'
            }
          },
          'raw-loader'
        ]
      },
      {
        test: /\.(svg|png|ico)$/,
        use: [
          { loader: 'file-loader', options: { esModule: false } }
        ]
      },
      {
        test: /worker\.js$/,
        use: { loader: 'worker-loader' }
      },
      {
        enforce: 'post',
        test: /mumble-streams\/lib\/data.js/,
        use: [
          'transform-loader?brfs'
        ]
      }
    ]
  },
  resolve: {
    fallback: {
      crypto: false,
      fs: false,
      stream: require.resolve('stream-browserify'),
      buffer: require.resolve('buffer/'),
      util: require.resolve('util/'),
      events: require.resolve('events/'),
      assert: require.resolve('assert/'),
      url: require.resolve('url/'),
      path: require.resolve('path-browserify'),
      process: require.resolve('process/browser')
    }
  },
  plugins: [new webpack.ProvidePlugin({
    Buffer: ['buffer', 'Buffer'],
    process: 'process/browser'
  })],
  target: 'web'
}
