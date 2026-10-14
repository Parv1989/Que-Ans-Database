const express = require('express');
const router = express.Router();
const QueryLog = require('../models/QueryLog');
const QA = require('../models/QA');
const { requireAdmin } = require('../middleware/auth');

router.use(requireAdmin);

// GET /api/admin/analytics/overview
router.get('/overview', async (req, res) => {
  try {
    const totalQueries = await QueryLog.countDocuments();
    const answeredCount = await QueryLog.countDocuments({ answered: true });
    const unansweredCount = await QueryLog.countDocuments({ answered: false });
    const pendingUnansweredCount = await QueryLog.countDocuments({ answered: false, resolved: false });

    const resolutionRate = totalQueries > 0 ? Math.round((answeredCount / totalQueries) * 100) : 100;

    // Top 10 most hit questions in database
    const topQuestions = await QA.find({ hitCount: { $gt: 0 } })
      .sort({ hitCount: -1 })
      .limit(10)
      .select('question answer hitCount className bookName chapterName')
      .lean();

    // 20 most recent user queries
    const recentQueries = await QueryLog.find()
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    res.json({
      totalQueries,
      answeredCount,
      unansweredCount,
      pendingUnansweredCount,
      resolutionRate,
      topQuestions,
      recentQueries
    });
  } catch (err) {
    console.error('Analytics overview error:', err);
    res.status(500).json({ error: 'Could not fetch analytics overview' });
  }
});

// GET /api/admin/analytics/unanswered - lists grouped unresolved queries
router.get('/unanswered', async (req, res) => {
  try {
    const list = await QueryLog.aggregate([
      { $match: { answered: false, resolved: false } },
      {
        $group: {
          _id: { $toLower: { $trim: { input: '$query' } } },
          originalQuery: { $first: '$query' },
          count: { $sum: 1 },
          lastAsked: { $max: '$createdAt' },
          className: { $first: '$className' },
          bookName: { $first: '$bookName' },
          chapterName: { $first: '$chapterName' },
          ids: { $push: '$_id' }
        }
      },
      { $sort: { count: -1, lastAsked: -1 } },
      { $limit: 100 }
    ]);

    res.json(list);
  } catch (err) {
    console.error('Analytics unanswered list error:', err);
    res.status(500).json({ error: 'Could not fetch unanswered queries' });
  }
});

// POST /api/admin/analytics/resolve - marks a query or group of query logs as resolved
router.post('/resolve', async (req, res) => {
  try {
    const { queryText, ids } = req.body;
    let filter = {};

    if (Array.isArray(ids) && ids.length > 0) {
      filter._id = { $in: ids };
    } else if (queryText && queryText.trim()) {
      const safeText = queryText.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.query = new RegExp('^' + safeText + '$', 'i');
    } else {
      return res.status(400).json({ error: 'No query or IDs specified to resolve' });
    }

    const result = await QueryLog.updateMany(filter, { resolved: true });
    res.json({ updatedCount: result.modifiedCount });
  } catch (err) {
    console.error('Resolve query log error:', err);
    res.status(500).json({ error: 'Could not resolve query logs' });
  }
});

// DELETE /api/admin/analytics/clear-logs - clears logs
router.delete('/clear-logs', async (req, res) => {
  try {
    const result = await QueryLog.deleteMany({});
    res.json({ deletedCount: result.deletedCount });
  } catch (err) {
    console.error('Clear query logs error:', err);
    res.status(500).json({ error: 'Could not clear query logs' });
  }
});

module.exports = router;
