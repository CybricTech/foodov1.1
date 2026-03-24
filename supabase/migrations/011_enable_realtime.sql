-- Enable Supabase Realtime for orders and payments tables.
-- Without this, postgres_changes subscriptions in the client never fire,
-- requiring manual page refreshes to see new orders or status updates.
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE payments;
