USE legacy;

-- Update display order for existing funnels to make room for Geral (0 or 1)
UPDATE funnels SET display_order = display_order + 1;

-- Insert Geral Funnel
INSERT INTO funnels (name, slug, color, description, display_order)
VALUES ('Geral', 'geral', 'hsl(220 10% 20%)', 'Recepção geral de novos leads', 1);

SET @geral_id = LAST_INSERT_ID();

-- Remove 'recebido' stage from other funnels
DELETE FROM funnel_stages WHERE stage_id = (SELECT id FROM stages WHERE slug = 'recebido');

-- Add 'recebido' stage ONLY to Geral funnel
INSERT INTO funnel_stages (funnel_id, stage_id, display_order, is_auto, bot_stage_trigger)
VALUES (@geral_id, (SELECT id FROM stages WHERE slug = 'recebido'), 1, 1, 'reception');

-- Update any leads currently in 'recebido' stage to the 'geral' funnel
UPDATE leads SET funnel_id = @geral_id WHERE stage_id = (SELECT id FROM stages WHERE slug = 'recebido');
