import React, { useEffect, useState } from 'react';
import { blogPostRepo } from '@/api/repo';
import useCurrentUser from '@/hooks/useCurrentUser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import ReactQuill from 'react-quill';
import { toast } from 'sonner';
import { format } from 'date-fns';

const empty = { title: '', slug: '', excerpt: '', body: '', cover_image: '', tags: [], status: 'draft', author_name: '', seo_description: '', seo_keywords: '' };

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export default function AdminBlog() {
  const { isAdmin, isSuperAdmin } = useCurrentUser();
  const [posts, setPosts] = useState([]);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [tagInput, setTagInput] = useState('');

  useEffect(() => { load(); }, []);
  const load = () => blogPostRepo.list('-created_date').then(setPosts);

  // Draft fields save directly (admin label); publish/unpublish must go
  // through adminOps.publishBlogPost so the server flips the public
  // per-document read grant that makes the post visible on the site.
  const save = async () => {
    if (!editing.title || !editing.slug) { toast.error('Title and slug are required'); return; }
    const { status: desiredStatus, ...fields } = editing;
    const previousStatus = editing.id
      ? (posts.find(p => p.id === editing.id)?.status || 'draft')
      : 'draft';
    try {
      let savedId = editing.id;
      if (editing.id) {
        await blogPostRepo.update(editing.id, fields);
      } else {
        const created = await blogPostRepo.create(fields);
        savedId = created?.id;
      }
      if (savedId && desiredStatus !== previousStatus) {
        await blogPostRepo.publish(savedId, desiredStatus === 'published');
      }
      toast.success('Post saved');
      setOpen(false);
      load();
    } catch (err) {
      toast.error(err?.message || 'Could not save the post.');
    }
  };

  const remove = async (id) => {
    try {
      await blogPostRepo.delete(id);
      toast.success('Post deleted');
      load();
    } catch (err) {
      toast.error(err?.message || 'Could not delete the post. Unpublish it instead if deletion is not permitted.');
    }
  };

  const addTag = () => {
    if (tagInput.trim()) {
      setEditing({ ...editing, tags: [...(editing.tags || []), tagInput.trim()] });
      setTagInput('');
    }
  };

  if (!isAdmin) return <div className="py-24 text-center text-muted-foreground">Access denied.</div>;

  return (
    <div className="py-12">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between mb-8">
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">BLOG POSTS</h1>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { setEditing({ ...empty, tags: [] }); setTagInput(''); }} className="bg-accent text-accent-foreground font-display tracking-wider uppercase text-xs hover:bg-accent/90">
                <Plus className="w-4 h-4 mr-2" /> New Post
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl bg-card border-border max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle className="font-display tracking-wider">{editing?.id ? 'EDIT POST' : 'NEW POST'}</DialogTitle></DialogHeader>
              {editing && (
                <div className="space-y-4 mt-4">
                  <div>
                    <Label className="font-display tracking-wider uppercase text-xs">Title</Label>
                    <Input
                      value={editing.title}
                      onChange={e => setEditing({ ...editing, title: e.target.value, slug: editing.slug || slugify(e.target.value) })}
                      className="bg-secondary border-border mt-1"
                    />
                  </div>
                  <div>
                    <Label className="font-display tracking-wider uppercase text-xs">Slug</Label>
                    <Input value={editing.slug} onChange={e => setEditing({ ...editing, slug: slugify(e.target.value) })} className="bg-secondary border-border mt-1" />
                  </div>
                  <div>
                    <Label className="font-display tracking-wider uppercase text-xs">Author</Label>
                    <Input value={editing.author_name || ''} onChange={e => setEditing({ ...editing, author_name: e.target.value })} className="bg-secondary border-border mt-1" />
                  </div>
                  <div>
                    <Label className="font-display tracking-wider uppercase text-xs">Cover Image URL</Label>
                    <Input value={editing.cover_image || ''} onChange={e => setEditing({ ...editing, cover_image: e.target.value })} className="bg-secondary border-border mt-1" />
                  </div>
                  <div>
                    <Label className="font-display tracking-wider uppercase text-xs">Excerpt</Label>
                    <Textarea value={editing.excerpt || ''} onChange={e => setEditing({ ...editing, excerpt: e.target.value })} className="bg-secondary border-border mt-1" rows={2} />
                  </div>
                  <div>
                    <Label className="font-display tracking-wider uppercase text-xs mb-1 block">Body</Label>
                    <ReactQuill
                      theme="snow"
                      value={editing.body || ''}
                      onChange={body => setEditing({ ...editing, body })}
                      className="bg-secondary rounded-md"
                    />
                  </div>
                  <div>
                    <Label className="font-display tracking-wider uppercase text-xs">Tags</Label>
                    <div className="flex gap-2 mt-1">
                      <Input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())} placeholder="Add tag" className="bg-secondary border-border" />
                      <Button type="button" variant="outline" size="sm" onClick={addTag}>Add</Button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {editing.tags?.map((t, i) => (
                        <Badge key={i} variant="secondary" className="cursor-pointer text-xs" onClick={() => setEditing({ ...editing, tags: editing.tags.filter((_, idx) => idx !== i) })}>{t} ×</Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="font-display tracking-wider uppercase text-xs">SEO Description</Label>
                    <Textarea value={editing.seo_description || ''} onChange={e => setEditing({ ...editing, seo_description: e.target.value })} className="bg-secondary border-border mt-1" rows={2} />
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={editing.status === 'published'}
                      onCheckedChange={v => {
                        if (v && !isSuperAdmin) { toast.error('Only super admins can publish posts'); return; }
                        setEditing({ ...editing, status: v ? 'published' : 'draft' });
                      }}
                    />
                    <Label className="text-sm">Published {!isSuperAdmin && <span className="text-xs text-muted-foreground">(super admin only)</span>}</Label>
                  </div>
                  <Button onClick={save} className="w-full bg-accent text-accent-foreground font-display tracking-wider uppercase hover:bg-accent/90">Save Post</Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>

        <div className="space-y-3">
          {posts.map(post => (
            <div key={post.id} className="bg-card border border-border rounded-lg p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-display tracking-wider text-foreground">{post.title}</p>
                  <Badge className={post.status === 'published' ? 'bg-green-500/10 text-green-400 border-green-500/20 border text-xs' : 'bg-muted text-muted-foreground text-xs'}>{post.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">/blog/{post.slug} · {post.author_name || 'No author'} · {format(new Date(post.created_date), 'MMM d, yyyy')}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => { setEditing({ ...post }); setOpen(true); }}><Pencil className="w-4 h-4" /></Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(post.id)}><Trash2 className="w-4 h-4" /></Button>
              </div>
            </div>
          ))}
          {posts.length === 0 && <p className="text-center text-muted-foreground py-8">No posts yet.</p>}
        </div>
      </div>
    </div>
  );
}