import { Request, Response } from 'express';
import { db } from '../config/database';

export async function getStats(req: Request, res: Response): Promise<void> {
    try {
        const today = new Date().toISOString().split('T')[0];
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const [
            totalLeads,
            activeLeads,
            approvedLeads,
            rejectedLeads,
            pendingTasks,
            todayTasks,
            overdueTasks,
            newLeadsToday,
            newLeadsWeek,
        ] = await Promise.all([
            db('leads').count('id as count').first(),
            db('leads').where({ status: 'active' }).count('id as count').first(),
            db('leads').where({ status: 'approved' }).count('id as count').first(),
            db('leads').where({ status: 'rejected' }).count('id as count').first(),
            db('tasks').whereIn('status', ['pendente', 'em_andamento']).count('id as count').first(),
            db('tasks').where({ due_date: today }).whereNot({ status: 'concluida' }).count('id as count').first(),
            db('tasks').where('due_date', '<', today).whereNot({ status: 'concluida' }).count('id as count').first(),
            db('leads').whereRaw('DATE(created_at) = ?', [today]).count('id as count').first(),
            db('leads').whereRaw('DATE(created_at) >= ?', [weekAgo]).count('id as count').first(),
        ]);

        res.json({
            success: true,
            data: {
                totalLeads: Number(totalLeads?.count || 0),
                activeLeads: Number(activeLeads?.count || 0),
                approvedLeads: Number(approvedLeads?.count || 0),
                rejectedLeads: Number(rejectedLeads?.count || 0),
                pendingTasks: Number(pendingTasks?.count || 0),
                todayTasks: Number(todayTasks?.count || 0),
                overdueTasks: Number(overdueTasks?.count || 0),
                newLeadsToday: Number(newLeadsToday?.count || 0),
                newLeadsWeek: Number(newLeadsWeek?.count || 0),
            },
        });
    } catch (err) {
        console.error('Get stats error:', err);
        res.status(500).json({ success: false, error: 'Erro ao buscar estatísticas' });
    }
}

export async function getCharts(req: Request, res: Response): Promise<void> {
    try {
        const [leadsByFunnel, leadsByStage, tasksByStatus, leadsOverTime] = await Promise.all([
            db('leads as l')
                .select('f.name as funnel', 'f.color', db.raw('COUNT(l.id) as count'))
                .leftJoin('funnels as f', 'l.funnel_id', 'f.id')
                .where('l.status', '!=', 'archived')
                .groupBy('l.funnel_id', 'f.name', 'f.color'),

            db('leads as l')
                .select('s.name as stage', db.raw('COUNT(l.id) as count'))
                .leftJoin('stages as s', 'l.stage_id', 's.id')
                .where('l.status', '!=', 'archived')
                .groupBy('l.stage_id', 's.name', 's.display_order')
                .orderBy('s.display_order'),

            db('tasks')
                .select('status', db.raw('COUNT(id) as count'))
                .groupBy('status'),

            db('leads')
                .select(db.raw("DATE(created_at) as date"), db.raw('COUNT(id) as count'))
                .whereRaw("created_at >= NOW() - INTERVAL '30 days'")
                .where('status', '!=', 'archived')
                .groupByRaw('DATE(created_at)')
                .orderBy('date', 'asc'),
        ]);

        res.json({
            success: true,
            data: {
                leadsByFunnel: leadsByFunnel.map(r => ({ ...r, count: Number(r.count) })),
                leadsByStage: leadsByStage.map(r => ({ ...r, count: Number(r.count) })),
                tasksByStatus: tasksByStatus.map(r => ({ ...r, count: Number(r.count) })),
                leadsOverTime: leadsOverTime.map(r => ({ ...r, count: Number(r.count) })),
            },
        });
    } catch (err) {
        console.error('Get charts error:', err);
        res.status(500).json({ success: false, error: 'Erro ao buscar dados dos gráficos' });
    }
}
