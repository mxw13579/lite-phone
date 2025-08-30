import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  base: './',
  publicDir: 'public',
  
  // 构建配置
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: false, // 禁用压缩以避免terser依赖
    
    // 分块策略
    rollupOptions: {
      output: {
        manualChunks: {
          // 核心模块
          'core': ['./src/constants/index.ts', './src/state/index.ts'],
          // 数据库模块  
          'database': ['./src/database/index.ts'],
          // 路由模块
          'router': ['./src/router/index.ts'],
          // 屏幕模块
          'screens': ['./src/screens/index.ts'],
          // 服务模块
          'services': ['./src/services/index.ts']
        }
      }
    },
    
    // 性能优化
    chunkSizeWarningLimit: 1000,
    
    // 资源处理
    assetsInlineLimit: 4096,
  },
  
  // 开发服务器配置
  server: {
    port: 3000,
    host: true,
    open: false,
    cors: true
  },
  
  // 预览服务器配置
  preview: {
    port: 3001,
    host: true,
    open: false
  },
  
  // 路径解析
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@constants': path.resolve(__dirname, 'src/constants'),
      '@state': path.resolve(__dirname, 'src/state'),
      '@database': path.resolve(__dirname, 'src/database'),
      '@router': path.resolve(__dirname, 'src/router'),
      '@screens': path.resolve(__dirname, 'src/screens'),
      '@services': path.resolve(__dirname, 'src/services'),
    },
  },
  
  // TypeScript 配置
  esbuild: {
    target: 'es2020',
    format: 'esm'
  },
  
  // 优化依赖
  optimizeDeps: {
    include: ['dexie', 'dexie-export-import', 'pako'],
    exclude: []
  }
});