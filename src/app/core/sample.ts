/** A small demo collection + environment that call a public, CORS-enabled API. */
export const SAMPLE_COLLECTION = {
  info: {
    _postman_id: 'sample-jsonplaceholder',
    name: 'JSONPlaceholder Demo API',
    description:
      'A demo collection for the **JSONPlaceholder** fake REST API.\n\n' +
      'Use the environment picker to switch the `baseUrl`, then open any endpoint and click **Send**.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  item: [
    {
      name: 'Posts',
      description: 'Create, read, update and delete blog posts.',
      item: [
        {
          name: 'List posts',
          request: {
            method: 'GET',
            header: [{ key: 'Accept', value: 'application/json' }],
            url: {
              raw: '{{baseUrl}}/posts?userId=1',
              host: ['{{baseUrl}}'],
              path: ['posts'],
              query: [
                { key: 'userId', value: '1', description: 'Only return posts of this user.' },
                { key: '_limit', value: '5', disabled: true, description: 'Max number of posts.' },
              ],
            },
            description: 'Returns all posts. Filter them with the `userId` query parameter.',
          },
          response: [
            {
              name: 'Success',
              code: 200,
              status: 'OK',
              _postman_previewlanguage: 'json',
              header: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
              body: '[{"userId":1,"id":1,"title":"sunt aut facere","body":"quia et suscipit"}]',
            },
          ],
        },
        {
          name: 'Get post by id',
          request: {
            method: 'GET',
            url: {
              raw: '{{baseUrl}}/posts/:id',
              host: ['{{baseUrl}}'],
              path: ['posts', ':id'],
              variable: [{ key: 'id', value: '1', description: 'The post id.' }],
            },
          },
        },
        {
          name: 'Create post',
          request: {
            method: 'POST',
            header: [{ key: 'Content-Type', value: 'application/json' }],
            body: {
              mode: 'raw',
              raw: '{\n  "title": "Hello",\n  "body": "My first post",\n  "userId": {{userId}}\n}',
              options: { raw: { language: 'json' } },
            },
            url: { raw: '{{baseUrl}}/posts', host: ['{{baseUrl}}'], path: ['posts'] },
            description: 'Creates a new post. The API does not really save it, but returns it with a new `id`.',
          },
        },
        {
          name: 'Update post',
          request: {
            method: 'PATCH',
            header: [{ key: 'Content-Type', value: 'application/json' }],
            body: { mode: 'raw', raw: '{\n  "title": "Updated title"\n}', options: { raw: { language: 'json' } } },
            url: { raw: '{{baseUrl}}/posts/1', host: ['{{baseUrl}}'], path: ['posts', '1'] },
          },
        },
        {
          name: 'Delete post',
          request: {
            method: 'DELETE',
            url: { raw: '{{baseUrl}}/posts/1', host: ['{{baseUrl}}'], path: ['posts', '1'] },
          },
        },
      ],
    },
    {
      name: 'Users',
      item: [
        {
          name: 'List users',
          request: {
            method: 'GET',
            auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }] },
            url: { raw: '{{baseUrl}}/users', host: ['{{baseUrl}}'], path: ['users'] },
            description: 'Returns all users. The bearer token is only here to show how auth works.',
          },
        },
      ],
    },
  ],
  variable: [
    { key: 'baseUrl', value: 'https://jsonplaceholder.typicode.com' },
    { key: 'userId', value: '1' },
  ],
};

export const SAMPLE_ENVIRONMENT = {
  name: 'Production',
  values: [
    { key: 'baseUrl', value: 'https://jsonplaceholder.typicode.com', enabled: true },
    { key: 'token', value: 'demo-token', type: 'secret', enabled: true },
  ],
  _postman_variable_scope: 'environment',
};
