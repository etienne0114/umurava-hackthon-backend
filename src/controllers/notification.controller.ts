import { Request, Response, NextFunction } from 'express';
import { Notification } from '../models/Notification';
import { User } from '../models/User';
import logger from '../utils/logger';

const DEFAULT_PREFERENCES = {
  masterEnabled: true,
  screeningCompleted: true,
  newApplicants: true,
  assessmentSubmitted: true,
  jobStatusChanged: true,
  systemAlerts: true,
};

export class NotificationController {
  /**
   * Get all notifications for the authenticated user.
   */
  async getNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as unknown as { user: { userId: string, role: string, email: string } }).user.userId;
      const notifications = await Notification.find({ userId })
        .sort({ createdAt: -1 })
        .limit(50);

      const unreadCount = await Notification.countDocuments({ userId, isRead: false });

      res.json({
        success: true,
        data: {
          notifications,
          unreadCount,
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Mark a single notification as read.
   */
  async markAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = (req as unknown as { user: { userId: string, role: string, email: string } }).user.userId;

      const notification = await Notification.findOneAndUpdate(
        { _id: id, userId },
        { isRead: true },
        { new: true }
      );

      if (!notification) {
        res.status(404).json({ success: false, error: 'Notification not found' });
        return;
      }

      res.json({ success: true, data: notification });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Mark all notifications as read for the user.
   */
  async markAllAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as unknown as { user: { userId: string, role: string, email: string } }).user.userId;
      await Notification.updateMany({ userId, isRead: false }, { isRead: true });

      res.json({ success: true, message: 'All notifications marked as read' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete a notification.
   */
  async deleteNotification(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = (req as unknown as { user: { userId: string, role: string, email: string } }).user.userId;

      const notification = await Notification.findOneAndDelete({ _id: id, userId });

      if (!notification) {
        res.status(404).json({ success: false, error: 'Notification not found' });
        return;
      }

      res.json({ success: true, message: 'Notification deleted' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get notification preferences for the authenticated user.
   */
  async getPreferences(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as unknown as { user: { userId: string } }).user.userId;
      const user = await User.findById(userId).select('notificationPreferences');

      if (!user) {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }

      const preferences = {
        ...DEFAULT_PREFERENCES,
        ...(user.notificationPreferences || {}),
      };

      res.json({ success: true, data: preferences });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update notification preferences for the authenticated user.
   */
  async updatePreferences(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as unknown as { user: { userId: string } }).user.userId;

      const allowed = ['masterEnabled', 'screeningCompleted', 'newApplicants', 'assessmentSubmitted', 'jobStatusChanged', 'systemAlerts'];
      const updates: Record<string, boolean> = {};

      for (const key of allowed) {
        if (typeof req.body[key] === 'boolean') {
          updates[`notificationPreferences.${key}`] = req.body[key];
        }
      }

      const user = await User.findByIdAndUpdate(
        userId,
        { $set: updates },
        { new: true, select: 'notificationPreferences' }
      );

      if (!user) {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }

      const preferences = {
        ...DEFAULT_PREFERENCES,
        ...(user.notificationPreferences || {}),
      };

      logger.info(`Notification preferences updated for user ${userId}`);
      res.json({ success: true, data: preferences });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Utility method to create a notification (internal use).
   * Respects the user's notification preferences before creating.
   */
  static async create(userId: string, type: string, title: string, message: string, link?: string): Promise<void> {
    try {
      // Check user preferences before creating the notification
      const user = await User.findById(userId).select('notificationPreferences');
      const prefs = user?.notificationPreferences;

      // If master switch is off, skip creating the notification
      if (prefs && prefs.masterEnabled === false) {
        logger.info(`Notification skipped for user ${userId} (notifications disabled): ${title}`);
        return;
      }

      // Map notification type/title patterns to preference keys
      const titleLower = title.toLowerCase();
      if (prefs) {
        if (!prefs.screeningCompleted && (titleLower.includes('screening') || titleLower.includes('shortlist'))) return;
        if (!prefs.newApplicants && (titleLower.includes('applicant') || titleLower.includes('candidate') || titleLower.includes('import'))) return;
        if (!prefs.assessmentSubmitted && (titleLower.includes('assessment') || titleLower.includes('test'))) return;
        if (!prefs.jobStatusChanged && (titleLower.includes('job') && (titleLower.includes('status') || titleLower.includes('closed') || titleLower.includes('active')))) return;
        if (!prefs.systemAlerts && type === 'error') return;
      }

      await Notification.create({ userId, type, title, message, link });
      logger.info(`Notification created for user ${userId}: ${title}`);
    } catch (error) {
      logger.error(`Failed to create notification for user ${userId}:`, error);
    }
  }
}

export const notificationController = new NotificationController();
