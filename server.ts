import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "mpa", // Multi-page app
    });
    app.use(vite.middlewares);
    
    // Fallback for admin SPA in dev
    app.get('/admin', (req, res, next) => {
      req.url = '/admin/index.html';
      vite.middlewares(req, res, next);
    });
    app.get('/admin/*', (req, res, next) => {
      req.url = '/admin/index.html';
      vite.middlewares(req, res, next);
    });

  } else {
    // Production serving
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    
    // Serve admin SPA
    app.get('/admin', (req, res) => res.sendFile(path.join(distPath, 'admin', 'index.html')));
    app.get('/admin/*', (req, res) => res.sendFile(path.join(distPath, 'admin', 'index.html')));
    
    // Serve main app
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
