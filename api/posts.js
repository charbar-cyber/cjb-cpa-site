// Vercel Serverless Function: List published blog posts from Notion

export default async function handler(req, res) {
    // Only allow GET requests
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const NOTION_TOKEN = process.env.NOTION_TOKEN;
    const DATABASE_ID = '14dd37ae-8683-4a5c-a60b-83dbbf5e35ca';

    if (!NOTION_TOKEN) {
        return res.status(500).json({ error: 'Notion token not configured', hint: 'Add NOTION_TOKEN to Vercel environment variables' });
    }

    // Optional category filter from query params
    const { category } = req.query;

    try {
        // Build filter for published posts
        const filter = {
            and: [
                {
                    property: 'Status',
                    select: {
                        equals: 'Published'
                    }
                }
            ]
        };

        // Add category filter if specified
        if (category && category !== 'all') {
            filter.and.push({
                property: 'Category',
                select: {
                    equals: category
                }
            });
        }

        // First, get database schema to find the correct property names
        const schemaResponse = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}`, {
            headers: {
                'Authorization': `Bearer ${NOTION_TOKEN}`,
                'Notion-Version': '2022-06-28',
            },
        });

        let datePropertyName = null;
        if (schemaResponse.ok) {
            const schema = await schemaResponse.json();
            // Find a date property
            for (const [name, prop] of Object.entries(schema.properties || {})) {
                if (prop.type === 'date') {
                    datePropertyName = name;
                    break;
                }
            }
        }

        // Build query with optional date sort
        const queryBody = { filter };
        if (datePropertyName) {
            queryBody.sorts = [{ property: datePropertyName, direction: 'descending' }];
        } else {
            // Fall back to sorting by created time
            queryBody.sorts = [{ timestamp: 'created_time', direction: 'descending' }];
        }

        const response = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${NOTION_TOKEN}`,
                'Notion-Version': '2022-06-28',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(queryBody),
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Notion API error:', errorData);
            return res.status(response.status).json({
                error: 'Failed to fetch posts from Notion',
                details: errorData.message || errorData.code || 'Unknown error',
                status: response.status
            });
        }

        const data = await response.json();

        // Transform Notion pages into our post format
        const posts = data.results.map(page => {
            const properties = page.properties;

            // Extract title (Name or Title property)
            const titleProp = properties.Name || properties.Title || properties.title;
            const title = titleProp?.title?.[0]?.plain_text || 'Untitled';

            // Extract category
            const categoryProp = properties.Category || properties.category;
            const postCategory = categoryProp?.select?.name || categoryProp?.multi_select?.[0]?.name || 'General';

            // Extract date - check various common property names or find any date property
            let date = page.created_time.split('T')[0];
            const datePropertyNames = ['Date', 'date', 'Publication Date', 'Publish Date', 'Published', 'Created'];
            for (const name of datePropertyNames) {
                if (properties[name]?.date?.start) {
                    date = properties[name].date.start;
                    break;
                }
            }
            // Also check for any date type property
            for (const [name, prop] of Object.entries(properties)) {
                if (prop.type === 'date' && prop.date?.start) {
                    date = prop.date.start;
                    break;
                }
            }

            // Extract excerpt/description if available
            const excerptProp = properties.Excerpt || properties.Description || properties.Summary;
            const excerpt = excerptProp?.rich_text?.[0]?.plain_text || '';

            // Extract slug if available
            const slugProp = properties.Slug || properties.slug;
            const slug = slugProp?.rich_text?.[0]?.plain_text || '';

            // Extract cover image
            const cover = page.cover?.external?.url || page.cover?.file?.url || null;

            return {
                id: page.id,
                title,
                category: postCategory,
                date,
                excerpt,
                slug,
                cover,
                url: page.url
            };
        });

        // Set cache headers (cache for 5 minutes, stale-while-revalidate for 1 hour)
        res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');

        return res.status(200).json({ posts });

    } catch (error) {
        console.error('Error fetching posts:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
