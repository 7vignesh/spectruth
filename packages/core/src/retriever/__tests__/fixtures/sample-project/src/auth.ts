import { Router } from 'express';
import { hashPassword, verifyPassword } from '../services/password';
import { createToken } from '../services/token';

const router = Router();

// POST /auth/register
router.post('/register', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  // Check duplicate email
  const existing = await db.users.findByEmail(email);
  if (existing) {
    return res.status(409).json({ error: 'Email already exists' });
  }

  const passwordHash = await hashPassword(password);
  const user = await db.users.create({ email, passwordHash });

  return res.status(201).json({ id: user.id, email: user.email });
});

// POST /auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  const user = await db.users.findByEmail(email);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = createToken(user.id);
  return res.status(200).json({ token });
});

export default router;
