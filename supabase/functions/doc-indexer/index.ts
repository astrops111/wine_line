import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const body = await req.json();
        const { articles } = body as { articles: any[] };

        if (!articles || articles.length === 0) {
            throw new Error('articles array is required and must not be empty');
        }

        const articleIds: string[] = [];
        const errors: string[] = [];

        for (const article of articles) {
            const { data, error } = await supabase
                .from('help_articles')
                .upsert(
                    {
                        title: article.title,
                        title_en: article.title_en,
                        content: article.content,
                        content_en: article.content_en,
                        category: article.category,
                        tags: [
                            ...(Array.isArray(article.tags) ? article.tags : []),
                            ...(Array.isArray(article.tags_en) ? article.tags_en : []),
                        ],
                        page_route: article.page_route,
                        language: 'bilingual',
                        generated_by: 'doc-agent',
                        updated_at: new Date().toISOString(),
                    },
                    {
                        onConflict: 'page_route',
                        ignoreDuplicates: false,
                    }
                )
                .select('id')
                .single();

            if (error) {
                console.error(`Failed to index article for ${article.page_route}:`, error);
                errors.push(`${article.page_route}: ${error.message}`);
                continue;
            }

            if (data?.id) articleIds.push(data.id);
        }

        return new Response(JSON.stringify({
            indexed_count: articleIds.length,
            article_ids: articleIds,
            total_submitted: articles.length,
            errors: errors.length > 0 ? errors : undefined,
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});
