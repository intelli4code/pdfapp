-- Create the pdfs table
CREATE TABLE IF NOT EXISTS pdfs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  annotations_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE pdfs ENABLE ROW LEVEL SECURITY;

-- Create policies for RLS
-- Users can only see their own PDFs
CREATE POLICY "Users can view own PDFs" ON pdfs
  FOR SELECT USING (auth.uid() = user_id);

-- Users can only insert their own PDFs
CREATE POLICY "Users can insert own PDFs" ON pdfs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can only update their own PDFs
CREATE POLICY "Users can update own PDFs" ON pdfs
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can only delete their own PDFs
CREATE POLICY "Users can delete own PDFs" ON pdfs
  FOR DELETE USING (auth.uid() = user_id);

-- Create an index for better performance
CREATE INDEX IF NOT EXISTS idx_pdfs_user_id ON pdfs(user_id);
CREATE INDEX IF NOT EXISTS idx_pdfs_uploaded_at ON pdfs(uploaded_at DESC);

-- Storage bucket policies (run these in the Supabase Storage settings)
-- For bucket 'secondmain':
-- INSERT policy: "Users can upload their own files"
-- bucket_id = 'secondmain' AND auth.uid()::text = (storage.foldername(name))[1]

-- SELECT policy: "Users can view their own files"  
-- bucket_id = 'secondmain' AND auth.uid()::text = (storage.foldername(name))[1]

-- UPDATE policy: "Users can update their own files"
-- bucket_id = 'secondmain' AND auth.uid()::text = (storage.foldername(name))[1]

-- DELETE policy: "Users can delete their own files"
-- bucket_id = 'secondmain' AND auth.uid()::text = (storage.foldername(name))[1]