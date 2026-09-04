-- Schema for PostgreSQL Database
-- This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.etf_holdings (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  etf_ticker text NOT NULL,
  constituent_ticker text NOT NULL,
  constituent_name text NOT NULL,
  sector text,
  country text,
  currency text,
  weight_pct numeric NOT NULL,
  as_of_date date NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT etf_holdings_pkey PRIMARY KEY (id)
);