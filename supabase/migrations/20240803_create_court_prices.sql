-- Create court_prices table
CREATE TABLE court_prices (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    court_id UUID NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_court_prices_court_id ON court_prices(court_id);
CREATE INDEX idx_court_prices_day_time ON court_prices(day_of_week, start_time, end_time);
CREATE INDEX idx_court_prices_active ON court_prices(is_active);

-- Add constraint to ensure start_time < end_time
ALTER TABLE court_prices ADD CONSTRAINT check_time_order CHECK (start_time < end_time);

-- Add unique constraint to prevent overlapping time slots for same court and day
CREATE UNIQUE INDEX idx_court_prices_no_overlap 
ON court_prices(court_id, day_of_week, start_time, end_time) 
WHERE is_active = true;

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_court_prices_updated_at 
    BEFORE UPDATE ON court_prices 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();