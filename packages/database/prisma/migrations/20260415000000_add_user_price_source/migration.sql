-- Add USER value to PriceSource enum
ALTER TYPE "PriceSource" ADD VALUE IF NOT EXISTS 'USER';
