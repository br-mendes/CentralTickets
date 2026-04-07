-- =====================================================
-- Central de Tickets - Supabase Schema Setup
-- =====================================================

-- 1. Create profiles table for user roles
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    role TEXT NOT NULL DEFAULT 'colab' CHECK (role IN ('gestor', 'colab')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Enable Row Level Security on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Policy: Users can view their own profile
CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

-- 4. Policy: Users can update their own profile
CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

-- 5. Policy: Users can insert their own profile (for signup)
CREATE POLICY "Users can insert own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

-- 6. Auto-create profile on user signup (using trigger)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, role)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'role', 'colab'));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Trigger to auto-create profile on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 8. Enable email confirmations (optional - set to false if you want instant access)
-- ALTER AUTH AUTH CONFIG SET ENABLE EMAIL CONFIRMATIONS = TRUE;

-- =====================================================
-- Row Level Security for tickets table
-- =====================================================

-- Enable RLS on tickets table
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone authenticated can read tickets
CREATE POLICY "Authenticated users can read tickets"
    ON public.tickets FOR SELECT
    TO authenticated
    USING (true);

-- Policy: Only service role can insert/update/delete tickets
CREATE POLICY "Service role can manage tickets"
    ON public.tickets FOR ALL
    TO service_role
    USING (true);
