import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'react': path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
    },
    dedupe: ['react', 'react-dom'],
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'process': 'undefined'
  },
  build: {
    outDir: 'dist-widget',
    cssCodeSplit: false,
    lib: {
      entry: path.resolve(__dirname, 'src/widget.tsx'),
      name: 'WkfloWidget',
      fileName: 'wkflo-widget',
      formats: ['umd']
    },
    rollupOptions: {
      external: [],
      output: {
        globals: {}
      },
      plugins: [
        // Rollup plugin to inline CSS
        {
          name: 'inline-css-rollup',
          generateBundle(options: any, bundle: any) {
            console.log('Plugin running, bundle keys:', Object.keys(bundle));
            
            const cssAssets = Object.keys(bundle).filter(fileName => {
              const asset = bundle[fileName];
              return asset.type === 'asset' && fileName.endsWith('.css');
            });
            
            const jsChunks = Object.keys(bundle).filter(fileName => {
              const chunk = bundle[fileName];
              return chunk.type === 'chunk' && (fileName.endsWith('.js') || fileName.endsWith('.cjs'));
            });
            
            console.log('CSS assets found:', cssAssets);
            console.log('JS chunks found:', jsChunks);
            
            if (cssAssets.length > 0 && jsChunks.length > 0) {
              // Get all CSS content
              const cssContent = cssAssets
                .map(fileName => bundle[fileName].source)
                .join('\n');
              
              // Get the main JS chunk (should be the UMD file)
              const mainChunk = jsChunks[0]; // Take the first (and likely only) JS chunk
              
              if (mainChunk && bundle[mainChunk]) {
                const jsChunk = bundle[mainChunk];
                
                // Create CSS injection code for Shadow DOM
                const cssInjectCode = `
// CSS content for Shadow DOM injection
window.__WKFLO_WIDGET_CSS__ = ${JSON.stringify(cssContent)};

`;
                
                console.log('Injecting CSS into:', mainChunk);
                
                // Prepend CSS injection to the JS bundle
                jsChunk.code = cssInjectCode + jsChunk.code;
                
                // Remove CSS assets from bundle
                cssAssets.forEach(fileName => {
                  console.log('Removing CSS asset:', fileName);
                  //delete bundle[fileName];
                });
              }
            }
          }
        },
        // Plugin to copy the built file to root dist folder
        {
          name: 'copy-to-root-dist',
          writeBundle() {
            const sourceFile = path.resolve(__dirname, 'dist-widget/wkflo-widget.umd.cjs');
            const targetDir = path.resolve(__dirname, '../dist/public/assets');
            const targetFile = path.resolve(targetDir, 'wkflo-widget.umd.cjs');
            
            // Ensure target directory exists
            if (!fs.existsSync(targetDir)) {
              fs.mkdirSync(targetDir, { recursive: true });
            }

            // Ensure target directory exists
            if (!fs.existsSync(targetDir)) {
              fs.mkdirSync(targetDir, { recursive: true });
            }
            
            // Copy the file
            if (fs.existsSync(sourceFile)) {
              fs.copyFileSync(sourceFile, targetFile);
              console.log('Widget copied to root dist folder');
            }

            const targetDir2 = path.resolve(__dirname, '../client/public/assets');

            // Ensure target directory exists
            if (!fs.existsSync(targetDir2)) {
              fs.mkdirSync(targetDir2, { recursive: true });
            }

            // Copy the file
            if (fs.existsSync(sourceFile)) {
              fs.copyFileSync(sourceFile, path.resolve(targetDir2, 'wkflo-widget.umd.cjs'));
              console.log('Widget copied to client dist folder');
            }
          }
        }
      ]
    }
  }
});