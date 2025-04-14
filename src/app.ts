import express from 'express';
import cors from 'cors';
import dbSyncRoutes from './routes/dbSync';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/db-sync', dbSyncRoutes);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something broke!' });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

export default app; 