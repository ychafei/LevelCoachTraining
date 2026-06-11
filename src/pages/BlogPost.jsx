import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { blogPostRepo } from '@/api/repo';
import ReactMarkdown from 'react-markdown';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Calendar, User } from 'lucide-react';
import { format } from 'date-fns';

export default function BlogPost() {
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);

  const slug = window.location.pathname.split('/blog/')[1];

  useEffect(() => {
    if (!slug) return;
    blogPostRepo.filter({ slug }).then(res => {
      if (res.length > 0) {
        setPost(res[0]);
        // Inject SEO meta tags
        const p = res[0];
        document.title = `${p.title} — LevelCoach Training`;
        const setMeta = (name, content) => {
          if (!content) return;
          let el = document.querySelector(`meta[name="${name}"]`) || document.querySelector(`meta[property="${name}"]`);
          if (!el) {
            el = document.createElement('meta');
            el.setAttribute(name.startsWith('og:') ? 'property' : 'name', name);
            document.head.appendChild(el);
          }
          el.setAttribute('content', content);
        };
        setMeta('description', p.seo_description || p.excerpt);
        setMeta('keywords', p.seo_keywords);
        setMeta('og:title', p.title);
        setMeta('og:description', p.seo_description || p.excerpt);
        if (p.cover_image) setMeta('og:image', p.cover_image);
      }
      setLoading(false);
    });
  }, [slug]);

  if (loading) {
    return (
      <div className="py-24 max-w-3xl mx-auto px-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-secondary rounded w-3/4" />
          <div className="h-4 bg-secondary rounded w-1/2" />
          <div className="aspect-video bg-secondary rounded-lg mt-8" />
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="py-24 text-center">
        <h1 className="font-display text-3xl font-bold text-foreground mb-4">Post not found</h1>
        <Link to="/blog" className="text-accent text-sm font-semibold">← Back to blog</Link>
      </div>
    );
  }

  return (
    <div className="py-24">
      <article className="max-w-3xl mx-auto px-4 sm:px-6">
        <Link to="/blog" className="inline-flex items-center gap-2 text-muted-foreground hover:text-accent text-sm font-semibold mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to blog
        </Link>

        {post.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {post.tags.map(tag => (
              <Badge key={tag} variant="secondary" className="text-xs font-bold uppercase tracking-[0.18em]">{tag}</Badge>
            ))}
          </div>
        )}

        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-4">
          {post.title}
        </h1>

        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-8">
          {post.author_name && (
            <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> {post.author_name}</span>
          )}
          <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> {format(new Date(post.created_date), 'MMMM d, yyyy')}</span>
        </div>

        {post.video_url && (
          <div className="aspect-video mb-8 rounded-lg overflow-hidden bg-secondary">
            <iframe
              src={post.video_url}
              title={post.title}
              className="w-full h-full"
              allowFullScreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            />
          </div>
        )}

        {post.cover_image && !post.video_url && (
          <div className="aspect-video mb-8 rounded-lg overflow-hidden">
            <img src={post.cover_image} alt={post.title} className="w-full h-full object-cover" />
          </div>
        )}

        <div className="prose prose-invert prose-sm max-w-none prose-headings:font-bold prose-headings:tracking-[-0.01em] prose-a:text-accent">
          <ReactMarkdown>{post.body || ''}</ReactMarkdown>
        </div>
      </article>
    </div>
  );
}