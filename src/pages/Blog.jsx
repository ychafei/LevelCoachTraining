import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { blogPostRepo } from '@/api/repo';
import { Badge } from '@/components/ui/badge';
import { Calendar, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { usePageMeta } from '@/features/marketing/usePageMeta';

export default function Blog() {
  usePageMeta({
    title: 'Blog',
    description: 'Training articles, coaching insights, and platform updates from the LevelCoach Training team.',
  });

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    blogPostRepo.filter({ status: 'published' }, '-created_date')
      .then((res) => setPosts(res))
      .catch((err) => {
        console.error('Blog load failed', err);
        setPosts([]);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mb-16">
          <h1 className="font-display text-5xl sm:text-6xl font-bold tracking-tight text-foreground mb-4">
            The blog
          </h1>
          <p className="text-lg text-muted-foreground">
            Training tips, coaching insights, and platform updates across every sport we serve.
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-card border border-border rounded-lg overflow-hidden animate-pulse">
                <div className="aspect-video bg-secondary" />
                <div className="p-6 space-y-3">
                  <div className="h-4 bg-secondary rounded w-3/4" />
                  <div className="h-3 bg-secondary rounded w-full" />
                  <div className="h-3 bg-secondary rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-muted-foreground">No posts yet. Check back soon.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {posts.map((post) => (
              <Link
                key={post.id}
                to={`/blog/${post.slug}`}
                className="group bg-card border border-border rounded-lg overflow-hidden hover:border-accent/30 transition-all duration-300"
              >
                {post.cover_image && (
                  <div className="aspect-video bg-secondary overflow-hidden">
                    <img
                      src={post.cover_image}
                      alt={post.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  </div>
                )}
                <div className="p-6">
                  {post.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {post.tags.slice(0, 3).map(tag => (
                        <Badge key={tag} variant="secondary" className="text-xs font-bold uppercase tracking-[0.18em]">{tag}</Badge>
                      ))}
                    </div>
                  )}
                  <h2 className="text-lg font-semibold text-foreground group-hover:text-accent transition-colors mb-2">
                    {post.title}
                  </h2>
                  {post.excerpt && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-4">{post.excerpt}</p>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      {format(new Date(post.created_date), 'MMM d, yyyy')}
                    </div>
                    <span className="text-accent text-xs font-semibold flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      Read <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}