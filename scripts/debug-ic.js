'use strict';
const WebSocket = require('ws');
const { db } = require('../server/db');
const jwt = require('jsonwebtoken');
const secret = process.env.JWT_SECRET || 'troque_por_um_segredo_fortetroque_por_um_segredo_fortetroque_por_um_segredo_fortetroque_por_um_segredo_forte';

let acc = db.prepare('SELECT id FROM accounts WHERE username=?').get('smoke_immdbg');
if (!acc) {
  db.prepare('INSERT INTO accounts (username, password_hash) VALUES (?,?)').run('smoke_immdbg', 'x');
  acc = db.prepare('SELECT id FROM accounts WHERE username=?').get('smoke_immdbg');
}
const token = jwt.sign({ accountId: acc.id, username: 'smoke_immdbg' }, secret);

let char = db.prepare('SELECT id FROM characters WHERE account_id=? AND is_alive=1').get(acc.id);
if (!char) {
  db.prepare('INSERT INTO characters (account_id,name,surname,gender,biome,profession,hp,max_hp,mp,max_mp,atk,def,spd,level,exp,gold,map_x,map_y,pos_x,pos_y,traits,inventory,equipment,skills,skill_xp,life_skills,status_effects,family_slot) VALUES (?,?,?,?,?,?,100,100,50,50,10,5,5,1,0,100,41002,41002,7,10,?,?,?,?,?,?,?,?)')
    .run(acc.id, 'DebugX', 'Imm', 'M', 'forest', 'martial', '[]', '[]', '{}', '[]', '{}', '{}', '[]', '{}');
  char = db.prepare('SELECT id FROM characters WHERE account_id=? AND is_alive=1').get(acc.id);
} else {
  db.prepare('UPDATE characters SET map_x=41121,map_y=41121,pos_x=7,pos_y=10 WHERE id=?').run(char.id);
}

db.prepare('INSERT INTO world_maps (map_x,map_y,biome,seed,settlement_stage) VALUES (41121,41121,?,700000000,?) ON CONFLICT(map_x,map_y) DO UPDATE SET seed=700000000,biome=excluded.biome,map_state=?')
  .run('forest', 'settled', '{}');

const ws = new WebSocket('ws://localhost:3011');
ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token })));
const msgs = [];
ws.on('message', raw => {
  const msg = JSON.parse(String(raw));
  msgs.push(msg.type);
  if (msg.type === 'interaction_context') {
    console.log('player pos from init:', msgs);
    console.log('IC:', JSON.stringify(msg.context));
    ws.close();
    process.exit(0);
  }
  if (msg.type === 'init') {
    const pl = msg.entities && msg.entities.find(e => e.id === msg.playerId);
    console.log('init player pos:', pl ? `(${pl.x},${pl.y})` : 'not found');
  }
  if (msg.type === 'error') { console.log('ERR:', JSON.stringify(msg)); ws.close(); process.exit(1); }
});
ws.on('error', e => { console.log('WS ERR:', e.message); process.exit(1); });
setTimeout(() => { console.log('TIMEOUT, got:', msgs); process.exit(1); }, 8000);
