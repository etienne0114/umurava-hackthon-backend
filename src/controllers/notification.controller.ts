import { Request, Response, NextFunction } from 'express';
import { Notification } from '../models/Notification';
import logger from '../utils/logger';

export class NotificationController {
  /**
   * Get all notifications for the authenticated user.
   */
  async getNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user.userId;
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
      const userId = (req as any).user.userId;

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
      const userId = (req as any).user.userId;
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
      const userId = (req as any).user.userId;

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
   * Utility method to create a notification (internal use).
   */
  static async create(userId: string, type: string, title: string, message: string, link?: string): Promise<void> {
    try {
      await Notification.create({
        userId,
        type,
        title,
        message,
        link,
      });
      logger.info(`Notification created for user ${userId}: ${title}`);
    } catch (error) {
      logger.error(`Failed to create notification for user ${userId}:`, error);
    }
  }
}

export const notificationController = new NotificationController();
