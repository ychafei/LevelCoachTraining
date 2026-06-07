import React from 'react';

export default function Privacy() {
  return (
    <div className="py-24">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-8">PRIVACY POLICY</h1>
        <div className="prose prose-invert prose-sm max-w-none space-y-6 text-muted-foreground">
          <p>Last updated: {new Date().toLocaleDateString()}</p>
          <h2 className="text-foreground">Information We Collect</h2>
          <p>We collect information you provide when creating an account, booking sessions, or using our messaging features. This includes name, email, phone number, and date of birth.</p>
          <h2 className="text-foreground">How We Use Information</h2>
          <p>Your information is used to facilitate session booking, coach-client communication, and platform operations. We send transactional emails related to bookings and account activity.</p>
          <h2 className="text-foreground">Data Sharing</h2>
          <p>We do not sell or share your personal information with third parties. Coach profiles are public, but client profiles are private and never publicly displayed.</p>
          <h2 className="text-foreground">Client Matching</h2>
          <p>If you opt into client matching, only your first name and player age are visible to other matched clients. No other personal information is shared before mutual acceptance.</p>
          <h2 className="text-foreground">Communication Monitoring</h2>
          <p>All messages sent through the platform are monitored for safety and quality assurance purposes.</p>
          <h2 className="text-foreground">Unsubscribe</h2>
          <p>You can unsubscribe from marketing emails at any time via the unsubscribe link in our emails or the <a href="/unsubscribe" className="text-accent">unsubscribe page</a>.</p>
        </div>
      </div>
    </div>
  );
}