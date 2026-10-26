const esbuild = require('esbuild');
const cssModulesPlugin = require('esbuild-plugin-css-modules');

esbuild.build({
  entryPoints: ['src/widget/components/WidgetTrademark.tsx'],
  bundle: true,
  outfile: 'test-output.js',
  format: 'esm',
  plugins: [
    cssModulesPlugin({
      localIdentName: '[local]_[hash:5:sha256:base64]',
      exportType: 'css-module',
      filter: /\.module\.css$/,
    })
  ],
  loader: {
    '.tsx': 'tsx',
    '.ts': 'ts',
    '.css': 'css',
  },
}).then(() => {
  console.log('Build succeeded');
  const fs = require('fs');
  const css = fs.readFileSync('test-output.css', 'utf8');
  console.log('Generated CSS:');
  console.log(css.substring(0, 500));
}).catch(() => process.exit(1));
