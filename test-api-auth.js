const jwt = require('jsonwebtoken');
require('dotenv').config();

const token = jwt.sign(
  { userId: '69cbddc360ff64ea820ccc93', email: 'test@example.com', role: 'company', companyId: '69cbddc360ff64ea820ccc93' },
  process.env.JWT_SECRET || 'your_jwt_secret_here',
  { expiresIn: '1h' }
);

console.log("TOKEN:", token);
