import type { EmailMessage } from './email.service.js';

/** Plain, friendly copy (spec 9). Links carry single-use tokens that expire. */
export const emails = {
  verify(to: string, link: string): EmailMessage {
    return {
      to,
      subject: 'Verify your email for Forge',
      text: `Welcome to Forge!\n\nConfirm your email address by opening this link (valid for 24 hours):\n${link}\n\nIf you didn't create an account, you can ignore this email.`,
    };
  },
  reset(to: string, link: string): EmailMessage {
    return {
      to,
      subject: 'Reset your Forge password',
      text: `Someone asked to reset the password for your Forge account.\n\nOpen this link to choose a new password (valid for 1 hour):\n${link}\n\nIf this wasn't you, ignore this email; your password stays the same.`,
    };
  },
  passwordChanged(to: string): EmailMessage {
    return {
      to,
      subject: 'Your Forge password was changed',
      text: `Your Forge password was just changed and all other devices were signed out.\n\nIf this wasn't you, reset your password immediately and contact support.`,
    };
  },
  deletionScheduled(to: string, date: string): EmailMessage {
    return {
      to,
      subject: 'Your Forge account will be deleted',
      text: `We received a request to delete your Forge account. It will be permanently deleted on ${date}.\n\nChanged your mind? Sign in before then and choose "Keep my account" in Settings.`,
    };
  },
  twoFactorChanged(to: string, enabled: boolean): EmailMessage {
    return {
      to,
      subject: `Two-factor authentication ${enabled ? 'turned on' : 'turned off'}`,
      text: `Two-factor authentication was ${enabled ? 'turned on' : 'turned off'} for your Forge account.\n\nIf this wasn't you, reset your password and contact support.`,
    };
  },
  weeklyDigest(
    to: string,
    d: {
      name: string;
      weekOf: string;
      xp: number;
      solved: number;
      lessons: number;
      dailies: number;
      level: number;
      streak: number;
      dashboardUrl: string;
      settingsUrl: string;
      unsubscribeUrl: string;
      oneClickUrl: string;
    },
  ): EmailMessage {
    const lines = [
      d.solved ? `- Problems solved: ${d.solved}` : null,
      d.lessons ? `- Lessons completed: ${d.lessons}` : null,
      d.dailies ? `- Daily challenges: ${d.dailies}` : null,
      `- XP earned: ${d.xp} (level ${d.level})`,
      d.streak > 1 ? `- Current streak: ${d.streak} days` : null,
    ].filter(Boolean);
    return {
      to,
      subject: 'Your week on Forge',
      text: `Hi ${d.name},\n\nHere is what you did on Forge in the week from ${d.weekOf}:\n\n${lines.join('\n')}\n\nYour dashboard: ${d.dashboardUrl}\n\nYou get this email because you turned on the weekly summary. Unsubscribe with one click: ${d.unsubscribeUrl}\nOr change it in your settings: ${d.settingsUrl}`,
      // RFC 8058 one-click unsubscribe, shown by mail clients next to the sender.
      headers: {
        'List-Unsubscribe': `<${d.oneClickUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    };
  },
};
