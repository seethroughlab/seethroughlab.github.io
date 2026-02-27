import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const projects = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    client: z.string().default(''),
    year: z.number().optional(),
    tags: z.array(z.string()).default([]),
    coverImage: z.string().default(''),
    videoSrc: z.string().default(''),
    featured: z.boolean().default(false),
    order: z.number().default(99),
    role: z.string().default(''),
    tech: z.array(z.string()).default([]),
  }),
});

const research = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/research' }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    subtitle: z.string().default(''),
    status: z.enum(['active', 'archived', 'experiment']).default('active'),
    githubUrl: z.string().default(''),
    coverImage: z.string().default(''),
    labUrl: z.string().default(''),
    instagramPosts: z.array(z.string()).default([]),
    videos: z.array(z.string()).default([]),
  }),
});

export const collections = { projects, research };
