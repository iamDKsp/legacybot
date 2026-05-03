DELETE FROM funnel_stages;

SET @trab=(SELECT id FROM funnels WHERE slug='trabalhista');
SET @neg=(SELECT id FROM funnels WHERE slug='negativado');
SET @pix=(SELECT id FROM funnels WHERE slug='golpe-pix');
SET @ciber=(SELECT id FROM funnels WHERE slug='golpe-cibernetico');

SET @rec=(SELECT id FROM stages WHERE slug='recebido');
SET @abord=(SELECT id FROM stages WHERE slug='abordagem');
SET @coleta=(SELECT id FROM stages WHERE slug='coleta_info');
SET @doc=(SELECT id FROM stages WHERE slug='documentacao');
SET @ass=(SELECT id FROM stages WHERE slug='assinatura');
SET @analEsp=(SELECT id FROM stages WHERE slug='analise_espera');
SET @fin=(SELECT id FROM stages WHERE slug='finalizado');

-- TRABALHISTA: Recebido > Abordagem > Documentacao > Assinatura > Analise e Espera > Finalizado
INSERT INTO funnel_stages (funnel_id,stage_id,display_order,is_auto,bot_stage_trigger) VALUES
(@trab,@rec,1,1,'reception'),
(@trab,@abord,2,1,'approach'),
(@trab,@doc,3,1,'doc_request'),
(@trab,@ass,4,0,NULL),
(@trab,@analEsp,5,0,NULL),
(@trab,@fin,6,0,NULL);

-- CLIENTE NEGATIVADO: Recebido > Abordagem > Documentacao > Assinatura > Analise e Espera > Finalizado
INSERT INTO funnel_stages (funnel_id,stage_id,display_order,is_auto,bot_stage_trigger) VALUES
(@neg,@rec,1,1,'reception'),
(@neg,@abord,2,1,'approach'),
(@neg,@doc,3,1,'doc_request'),
(@neg,@ass,4,0,NULL),
(@neg,@analEsp,5,0,NULL),
(@neg,@fin,6,0,NULL);

-- GOLPE DO PIX: Recebido > Abordagem > Coleta de Info > Documentacao > Assinatura > Analise e Espera > Finalizado
INSERT INTO funnel_stages (funnel_id,stage_id,display_order,is_auto,bot_stage_trigger) VALUES
(@pix,@rec,1,1,'reception'),
(@pix,@abord,2,1,'approach'),
(@pix,@coleta,3,1,'info_collection'),
(@pix,@doc,4,1,'doc_request'),
(@pix,@ass,5,0,NULL),
(@pix,@analEsp,6,0,NULL),
(@pix,@fin,7,0,NULL);

-- GOLPE CIBERNETICO: Recebido > Abordagem > Documentacao > Assinatura > Analise e Espera > Finalizado
INSERT INTO funnel_stages (funnel_id,stage_id,display_order,is_auto,bot_stage_trigger) VALUES
(@ciber,@rec,1,1,'reception'),
(@ciber,@abord,2,1,'approach'),
(@ciber,@doc,3,1,'doc_request'),
(@ciber,@ass,4,0,NULL),
(@ciber,@analEsp,5,0,NULL),
(@ciber,@fin,6,0,NULL);

SELECT CONCAT(f.name,' | ',s.name,' | ordem:',fs.display_order) as resultado
FROM funnel_stages fs
JOIN funnels f ON fs.funnel_id=f.id
JOIN stages s ON fs.stage_id=s.id
ORDER BY f.name, fs.display_order;
