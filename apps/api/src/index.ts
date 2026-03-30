import express from 'express';
import cors from 'cors';
import authRouter from './routes/auth';
import fleetRouter from './routes/fleet';
import tripsRouter from './routes/trips';
import sosRouter from './routes/sos';

const app = express();
app.use(cors());
app.use(express.json());
app.use('/auth', authRouter);
app.use('/fleet', fleetRouter);
app.use('/trips', tripsRouter);
app.use('/sos', sosRouter);

app.listen(3001, () => console.log('API running on :3001'));