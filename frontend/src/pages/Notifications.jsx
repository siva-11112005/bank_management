import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  deleteNotification,
  getMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../services/api";
import "./Notifications.css";

const formatNotificationTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const Notifications = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState("");

  const totalCount = notifications.length;

  const syncNavbarBadge = () => {
    window.dispatchEvent(new Event("notifications:updated"));
  };

  const fetchNotifications = useCallback(
    async (withLoader = false) => {
      if (withLoader) setLoading(true);
      setRefreshing(!withLoader);
      setError("");
      try {
        const response = await getMyNotifications({ status: statusFilter, limit: 200, page: 1 });
        const data = response?.data || {};
        setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
        setUnreadCount(Number(data.unreadCount) || 0);
      } catch (fetchError) {
        setError(fetchError.response?.data?.message || "Unable to load notifications right now.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [statusFilter]
  );

  useEffect(() => {
    fetchNotifications(true);
  }, [fetchNotifications]);

  const hasUnread = useMemo(() => notifications.some((item) => !item.isRead), [notifications]);

  const handleMarkRead = async (notificationId) => {
    setBusyId(`read-${notificationId}`);
    try {
      await markNotificationRead(notificationId);
      setNotifications((prev) =>
        prev.map((item) => (item._id === notificationId ? { ...item, isRead: true, readAt: new Date().toISOString() } : item))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      syncNavbarBadge();
    } catch (markError) {
      setError(markError.response?.data?.message || "Unable to mark notification as read.");
    } finally {
      setBusyId("");
    }
  };

  const handleMarkAllRead = async () => {
    setBusyId("mark-all");
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true, readAt: item.readAt || new Date().toISOString() })));
      setUnreadCount(0);
      syncNavbarBadge();
    } catch (markError) {
      setError(markError.response?.data?.message || "Unable to mark all notifications as read.");
    } finally {
      setBusyId("");
    }
  };

  const handleDelete = async (notificationId) => {
    setBusyId(`delete-${notificationId}`);
    try {
      const target = notifications.find((item) => item._id === notificationId);
      await deleteNotification(notificationId);
      setNotifications((prev) => prev.filter((item) => item._id !== notificationId));
      if (target && !target.isRead) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
      syncNavbarBadge();
    } catch (deleteError) {
      setError(deleteError.response?.data?.message || "Unable to remove notification.");
    } finally {
      setBusyId("");
    }
  };

  const handleOpenNotification = async (item) => {
    if (!item?.actionLink) return;

    const notificationId = item._id;
    if (notificationId && !item.isRead) {
      setNotifications((prev) =>
        prev.map((entry) => (entry._id === notificationId ? { ...entry, isRead: true, readAt: new Date().toISOString() } : entry))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      syncNavbarBadge();

      try {
        await markNotificationRead(notificationId);
      } catch (_) {}
    }

    navigate(item.actionLink);
  };

  return (
    <div className="notifications-page">
      <div className="notifications-shell">
        <div className="notifications-header">
          <div>
            <h1>Notifications</h1>
            <p>Track your latest banking alerts, updates, and service outcomes.</p>
          </div>
          <div className="notifications-header-actions">
            <button type="button" className="notifications-btn notifications-btn-outline" onClick={() => fetchNotifications()} disabled={refreshing}>
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
            <button
              type="button"
              className="notifications-btn notifications-btn-primary"
              onClick={handleMarkAllRead}
              disabled={!hasUnread || busyId === "mark-all"}
            >
              {busyId === "mark-all" ? "Marking..." : "Mark All Read"}
            </button>
          </div>
        </div>

        <div className="notifications-toolbar">
          <div className="notifications-filter-group">
            <button
              type="button"
              className={`notifications-filter-btn ${statusFilter === "ALL" ? "active" : ""}`}
              onClick={() => setStatusFilter("ALL")}
            >
              All
            </button>
            <button
              type="button"
              className={`notifications-filter-btn ${statusFilter === "UNREAD" ? "active" : ""}`}
              onClick={() => setStatusFilter("UNREAD")}
            >
              Unread
            </button>
          </div>
          <div className="notifications-summary">
            <span>Total: {totalCount}</span>
            <span>Unread: {unreadCount}</span>
          </div>
        </div>

        {error ? <p className="notifications-error">{error}</p> : null}

        {loading ? (
          <div className="notifications-empty">
            <h3>Loading notifications...</h3>
          </div>
        ) : notifications.length === 0 ? (
          <div className="notifications-empty">
            <h3>No notifications found</h3>
            <p>Your latest account alerts will appear here.</p>
          </div>
        ) : (
          <div className="notifications-list">
            {notifications.map((item) => (
              <article key={item._id} className={`notifications-card ${item.isRead ? "" : "unread"}`}>
                <div className="notifications-card-head">
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.message}</p>
                  </div>
                  <div className="notifications-meta">
                    <span className={`notifications-type notifications-type-${String(item.type || "INFO").toLowerCase()}`}>
                      {item.type || "INFO"}
                    </span>
                    <span className="notifications-category">{item.category || "GENERAL"}</span>
                  </div>
                </div>
                <div className="notifications-card-foot">
                  <small>{formatNotificationTime(item.createdAt)}</small>
                  <div className="notifications-card-actions">
                    {!item.isRead ? (
                      <button
                        type="button"
                        className="notifications-btn notifications-btn-ghost"
                        onClick={() => handleMarkRead(item._id)}
                        disabled={busyId === `read-${item._id}`}
                      >
                        {busyId === `read-${item._id}` ? "Saving..." : "Mark Read"}
                      </button>
                    ) : null}
                    {item.actionLink ? (
                      <button
                        type="button"
                        className="notifications-btn notifications-btn-outline"
                        onClick={() => handleOpenNotification(item)}
                      >
                        Open
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="notifications-btn notifications-btn-danger"
                      onClick={() => handleDelete(item._id)}
                      disabled={busyId === `delete-${item._id}`}
                    >
                      {busyId === `delete-${item._id}` ? "Removing..." : "Remove"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Notifications;
