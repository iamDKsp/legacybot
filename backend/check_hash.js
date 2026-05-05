const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const DB_URL = 'postgresql://postgres:iJpZRxLgSMxcwfOihUUhlKXgVIcjopxF@trolley.proxy.rlwy.net:37412/railway';
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production';

async function main() {
    console.log('JWT_SECRET definido?', !!JWT_SECRET, '| Length:', JWT_SECRET.length);

    const c = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
    await c.connect();
    console.log('✅ DB conectado');

    // Simula exatamente o que o controller faz
    const r = await c.query('SELECT * FROM users WHERE email = $1 AND is_active = $2', ['tarcisio@legacy.com', true]);
    const user = r.rows[0];
    console.log('Usuário encontrado:', user ? `ID ${user.id}` : 'NÃO ENCONTRADO');

    if (!user) { await c.end(); return; }

    const isValid = await bcrypt.compare('123', user.password_hash);
    console.log('Senha válida:', isValid);

    if (!isValid) { await c.end(); return; }

    try {
        const payload = { userId: user.id, email: user.email, role: user.role };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
        console.log('✅ Token gerado com sucesso! Primeiros 30 chars:', token.substring(0, 30) + '...');
    } catch (e) {
        console.error('❌ ERRO no jwt.sign:', e.message);
    }

    await c.end();
    console.log('🎉 Diagnóstico completo');
}

main().catch(e => { console.error('❌ Erro geral:', e.message); process.exit(1); });
