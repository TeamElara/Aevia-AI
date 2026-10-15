/** Register on the team's Express-compatible app after JWT middleware sets req.user.id.
 * Authentication and policy remain gateway responsibilities; no identity is taken from request bodies.
 */
export function registerAccessRoutes(app, service) {
  const route = handler => async (req, res) => {
    if (!req.user?.id) return res.status(401).json({ error: 'Authentication required' });
    try { return res.json(await handler(req)); }
    catch { return res.status(403).json({ error: 'Access request unavailable' }); }
  };
  app.post('/api/access/retrieve', route(req => service.run(req.user.id, req.body)));
  app.get('/api/approvals', route(req => service.list(req.user.id)));
  app.post('/api/approvals/:id/approve', route(req => service.approve(req.params.id, req.user.id, req.body?.request_hash)));
  app.post('/api/approvals/:id/reject', route(async req => { await service.reject(req.params.id, req.user.id); return { status: 'rejected' }; }));
  app.get('/api/access/results/:id', route(req => service.result(req.params.id, req.user.id, req.query?.conversation_id)));
}
